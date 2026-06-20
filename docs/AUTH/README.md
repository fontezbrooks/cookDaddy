# Auth Completion — Requirements Spec

**Status:** Requirements discovery complete (2026-06-20). Next: `/sc:design` then `/sc:workflow`.
**Origin:** Tech-debt pivot Issue 1 — auth is a P4 "shell" never finished (`src/app/(auth)/sign-in.tsx:72-73` defers the rest to "P5 work" that never landed).
**Scope decision:** one cohesive "finish auth" PR covering all four gaps.

## Goal

Make Sign Up / Sign In production-ready and give users the account-lifecycle controls
the App Store requires: a working email path (new **and** returning users), a sign-out,
and account deletion.

## Grounded findings (what already exists)

These constrain the work — most of the infrastructure is present; the gaps are mostly **client UI**.

- **Route guard exists.** `src/app/(app)/_layout.tsx` redirects unauthenticated → `/(auth)/sign-in`, and unboarded → `/onboarding`. Sign-out just needs to drop the Clerk session; the guard handles the redirect.
- **OAuth works.** Apple + Google via `useOAuth` complete inside Clerk and `setActive` → `/home`. Leave as-is.
- **Server-side account deletion already implemented.** `supabase/functions/clerk-user-webhook/index.ts:79-107` handles Clerk `user.deleted`: archives the user's active pod (partner routed to "partner removed me", FR-P6) then deletes the `users` row; `on delete cascade` FKs (migrations 003–011) wipe dietary/pods/swipes/ratings/shopping. **No new migration or RPC is needed for delete-account** — the client calls Clerk `user.delete()` and the webhook cascades.
- **Settings surface exists.** `settings/index.tsx` is a link hub; `settings/profile.tsx` is the natural home for account actions. Existing confirm pattern: "Leave pod" / "Dissolve pod" Alerts.
- **Auth store exists but is half-wired.** `useAuthStore.clearUser()` is defined yet **called nowhere** — sign-out must call it.

## Functional requirements

### FR-A1 — Email Sign Up (new users) + Sign In (returning), explicit toggle
- A segmented **Sign in / Sign up** toggle on the auth screen; both paths share one email field and one code-entry step.
- **Sign up:** `useSignUp` → `signUp.create({ emailAddress })` → `prepareEmailAddressVerification({ strategy: 'email_code' })`.
- **Sign in:** `useSignIn` → `signIn.create({ identifier, strategy: 'email_code' })` (current call; only valid for existing users — hence the toggle).
- OAuth (Apple/Google) buttons remain available in both toggle states.

### FR-A2 — Email code-entry step (the broken dead-end)
- After a code is sent, present a **code-entry screen/state** with an OTP input and a verify action.
- **Sign up:** `signUp.attemptEmailAddressVerification({ code })` → on success `setActive({ session: createdSessionId })`.
- **Sign in:** `signIn.attemptFirstFactor({ strategy: 'email_code', code })` → `setActive`.
- On success, redirect to `postSignInTarget` (reuse the existing sanitized `redirect` logic in `sign-in.tsx:29-34`).
- **Resend code** action (cooldown so it can't be spammed).
- **Back / change email** action that returns to the email step without a full reload.

### FR-A3 — Sign Out
- A **Sign out** control in Settings (hub or profile — design decides).
- Action: Clerk `signOut()` → `useAuthStore.clearUser()` → clear pod/onboarding-dependent caches as needed → guard redirects to sign-in.
- No confirm dialog required (low-stakes, reversible).

### FR-A4 — Delete Account
- A **Delete account** control in Settings, visually de-emphasized / destructive styling.
- **Confirm dialog** (decided): native Alert — "Delete account? This permanently removes your data and can't be undone." Cancel / Delete.
- Action: Clerk `user.delete()` → then sign-out locally (clears session + store) → redirect to sign-in.
- Server cascade handled by the existing webhook (see findings). **Verify the prod Clerk dashboard is subscribed to `user.deleted`** — without that subscription the Supabase `users` row is orphaned.

## Non-functional requirements

- **NFR-1 Error handling:** every Clerk call surfaces a user-readable error (wrong/expired code, network, rate-limit, email-already-exists on sign-up, user-not-found on sign-in). No raw exception strings to users.
- **NFR-2 Loading/disabled states:** preserve the existing `pending` pattern; disable inputs/buttons during in-flight calls; OTP verify disabled until code length is valid.
- **NFR-3 Design system:** replace the leftover hardcoded `#111`/`#fff`/`#888` in `sign-in.tsx` styles with `DesignTokens` (persimmon CTA, ink text) to match the post-redesign app and the AA-contrast rule.
- **NFR-4 Accessibility:** OTP input labeled; toggle is a real segmented control; destructive action distinguishable beyond color alone.
- **NFR-5 Security:** code-entry rate-limited (resend cooldown); no code/identifier logged; delete is irreversible and clearly stated.
- **NFR-6 Tests (≥80%):** unit-test toggle routing, code-entry success/failure for both sign-in and sign-up, sign-out clears store + redirects, delete calls `user.delete()` then signs out. Extend `(auth)/__tests__/sign-in.test.tsx`; add settings tests for sign-out/delete.

## User stories / acceptance criteria

- **US-1** As a new user, I pick "Sign up", enter my email, receive a code, enter it, and land in onboarding. ✅ when a never-seen email creates an account end-to-end.
- **US-2** As a returning user, I pick "Sign in", enter my email, receive a code, enter it, and land on Home. ✅ when an existing email signs in without hitting a dead end.
- **US-3** As a user who mistyped, I can resend the code or change my email without restarting the app. ✅ when resend + back both work from the code step.
- **US-4** As a signed-in user, I can sign out from Settings and am returned to the sign-in screen with local state cleared. ✅ when `clearUser` runs and the guard redirects.
- **US-5** As a user, I can delete my account after a confirm dialog; my data is removed and my partner is routed to "partner removed me". ✅ when `user.delete()` fires, webhook archives the pod + cascades, and I'm signed out.

## Open questions (resolve in `/sc:design`)

1. **Code-entry routing:** new screen (`(auth)/verify.tsx`) vs in-place state on `sign-in.tsx`? (Affects deep-link/back behavior.)
2. **Sign-out + Delete placement:** Settings **hub** (`index.tsx`) vs **profile** screen? Recommendation: both account-lifecycle actions grouped at the bottom of profile, or a new "Account" row in the hub.
3. **Post-delete partner UX:** confirm the archived-pod path actually triggers the partner's "removed me" screen on next foreground (it relies on `usePodSync`); add a test or manual QA note.
4. **Clerk dashboard prod subscription** to `user.deleted` — operator check, not code. Flag in the PR description.
5. **Email-exists / user-not-found cross-routing:** if a user picks "Sign up" with an existing email (or "Sign in" with an unknown one), do we hard-error or gently switch them to the other tab? (Decided model is explicit toggle, so default = clear error; auto-switch is a nice-to-have.)

## Related

- Memory: `project_tech_debt_pivot` (Issue 1), `project_clerk_supabase_thirdparty_auth` (JWKS/Third-Party Auth, `getToken()` takes no template arg).
- Code: `src/app/(auth)/sign-in.tsx`, `src/app/(app)/_layout.tsx`, `src/state/useAuthStore.ts`, `src/app/(app)/(tabs)/settings/`, `supabase/functions/clerk-user-webhook/index.ts`.

---

# Design (2026-06-20)

Resolves the 5 open questions and specifies components, Clerk contracts, flows, error mapping,
files, and tests. **No implementation code here** — next step is `/sc:workflow` → `/sc:implement` via codeagent.

## Decisions (open questions resolved)

| OQ | Decision | First-principles rationale |
|----|----------|----------------------------|
| 1 — code-entry routing | **In-place step state on the auth screen** (`step: 'method' \| 'code'`), NOT a separate `verify` route | `attemptFirstFactor`/`attemptEmailAddressVerification` must be called on the **same in-memory Clerk `signIn`/`signUp` resource** returned by `.create()`. Crossing an expo-router boundary would force stashing that resource in a ref/store and re-hydrating it — more state, more failure modes. There is also no legitimate reason to deep-link into a half-finished verification (the code is bound to the live resource). In-place is both simpler and more correct. |
| 2 — sign-out / delete placement | **New `settings/account.tsx`** ("Account" row in the hub), grouping both | `profile.tsx` is about *display* fields shown to the partner (name/avatar). Account-lifecycle (identity) is a different concern; co-locating sign-out + delete keeps the destructive action visually isolated. Adding one hub row matches the existing `SETTINGS_LINKS` pattern. |
| 3 — post-delete partner UX | **Rely on existing webhook + `usePodSync`; cover by manual-QA acceptance check** | The webhook already archives the pod on `user.deleted`; the partner's `usePodSync` surfaces "removed me" on next foreground. Can't exercise the webhook in Jest, so this is an explicit QA step, not a unit test. |
| 4 — Clerk `user.deleted` subscription | **Deployment precondition, flagged in PR** | Pure operator config in the Clerk dashboard; without it the Supabase `users` row orphans. Not code. |
| 5 — wrong-tab cross-routing | **Map the specific Clerk error codes to friendly copy + a one-tap "switch" action** | `form_identifier_exists` (sign-up w/ existing email) and the sign-in "not found" case are common; a dead-end error is poor UX when the fix is one tap to the other tab with the email pre-filled. Cheap, high-value. |

## Component architecture

Keep the Clerk resources + step state in **one container**; split the two visual steps into small
presentational components (file-org rule: focused files, container owns side-effects).

```
src/app/(auth)/sign-in.tsx        # CONTAINER — owns useSignIn/useSignUp, step state, redirect logic
  └─ <AuthMethodStep>             # mode toggle + email field + OAuth buttons   (new component file)
  └─ <AuthCodeStep>               # OTP input + verify + resend + change-email  (new component file)

src/components/auth/auth-method-step.tsx   # presentational, props-driven
src/components/auth/auth-code-step.tsx     # presentational, props-driven
src/lib/auth/clerk-errors.ts               # Clerk error-code → {message, switchTo?} mapper (pure, unit-tested)

src/app/(app)/(tabs)/settings/account.tsx  # NEW — Sign out + Delete account
src/app/(app)/(tabs)/settings/index.tsx    # +1 link: { href:'/settings/account', label:'Account' }
```

`(auth)/_layout.tsx` is unchanged (the code step is in-place, no new route). The container keeps the
existing **redirect sanitization** (`sign-in.tsx:29-34`) verbatim — it's security-sensitive.

## Auth screen state machine

```
state = { mode: 'signin' | 'signup', step: 'method' | 'code',
          email, code, pending, error, switchHint }

method ──submit(signup)──▶ signUp.create + prepareEmailAddressVerification ──▶ step=code
method ──submit(signin)──▶ signIn.create({strategy:email_code}) (+prepareFirstFactor) ──▶ step=code
code   ──verify(signup)──▶ signUp.attemptEmailAddressVerification ──complete──▶ setActive ▶ redirect
code   ──verify(signin)──▶ signIn.attemptFirstFactor({email_code}) ──complete──▶ setActive ▶ redirect
code   ──resend─────────▶ re-prepare on the SAME resource (cooldown-gated)
code   ──changeEmail────▶ step=method (resource discarded; fresh .create on next submit)
toggle (only enabled at step=method) flips mode; preserves typed email
```

OAuth (Apple/Google) stays available at `step==='method'` in **both** modes — unchanged logic.

## Clerk contracts (sequence)

**Sign up (new email):** `useSignUp()` → `signUp.create({ emailAddress })` →
`signUp.prepareEmailAddressVerification({ strategy:'email_code' })` → [code] →
`signUp.attemptEmailAddressVerification({ code })` → `status==='complete'` →
`setActive({ session: createdSessionId })` → `analytics.capture('signed_in',{provider:'email'})` → redirect.

**Sign in (existing email):** `useSignIn()` → `signIn.create({ identifier:email, strategy:'email_code' })`
(resolve the `email_code` factor's `emailAddressId` from `supportedFirstFactors` and `prepareFirstFactor`
if `create` didn't auto-prepare) → [code] → `signIn.attemptFirstFactor({ strategy:'email_code', code })`
→ `status==='complete'` → `setActive({ session: createdSessionId })` → redirect.

**Sign out:** `useClerk().signOut()` → `useAuthStore.getState().clearUser()` →
`usePodStore.getState().clearActivePod()` → `queryClient.clear()` → guard in `(app)/_layout.tsx`
redirects to sign-in. No confirm.

**Delete account:** `Alert.alert` confirm (mirror `pod.tsx:40-56`) → `useUser().user.delete()` →
then run the **sign-out** path → redirect. Server cascade is the existing webhook. Destructive styling
(`DesignTokens.color.dangerDeep`, `textOnDark`).

## Error mapping (`clerk-errors.ts`)

Pure function `mapClerkError(err): { message: string; switchTo?: 'signin'|'signup' }`. Examples:

| Clerk code / case | User copy | switchTo |
|---|---|---|
| `form_identifier_exists` (sign-up, email taken) | "That email already has an account." | `signin` |
| sign-in identifier not found | "No account for that email yet." | `signup` |
| `form_code_incorrect` | "That code isn't right — check and re-enter." | — |
| verification expired | "That code expired. Tap Resend for a new one." | — |
| rate-limited | "Too many tries. Wait a moment and resend." | — |
| network / unknown | "Something went wrong. Please try again." | — |

When `switchTo` is set, the error region renders a one-tap action that flips `mode`, keeps `email`,
and returns to `step='method'`.

## Files changed/added

- **Edit** `src/app/(auth)/sign-in.tsx` — container: add `useSignUp`, mode/step state, verify/resend/change-email, swap hardcoded `#111/#fff/#888` → `DesignTokens` (NFR-3).
- **Add** `src/components/auth/auth-method-step.tsx`, `src/components/auth/auth-code-step.tsx`.
- **Add** `src/lib/auth/clerk-errors.ts`.
- **Add** `src/app/(app)/(tabs)/settings/account.tsx`; **edit** `settings/index.tsx` (+1 link).
- **Tests:** extend `(auth)/__tests__/sign-in.test.tsx`; add `clerk-errors.test.ts`, `settings/__tests__/account.test.tsx`.

## Test plan (≥80%, requirement-mapped)

| Case | Maps to | File |
|---|---|---|
| Toggle flips mode, preserves email, only at method step | FR-A1 | sign-in.test |
| Sign-up: create+prepare → code step; verify complete → setActive+redirect | FR-A1/A2, US-1 | sign-in.test |
| Sign-in: create → code step; attemptFirstFactor complete → setActive+redirect | FR-A2, US-2 | sign-in.test |
| Wrong code → `form_code_incorrect` copy, stays on code step | NFR-1 | sign-in.test |
| Resend gated by cooldown; change-email returns to method | FR-A2, US-3 | sign-in.test |
| `form_identifier_exists` renders switch-to-signin action | OQ5 | sign-in.test + clerk-errors.test |
| OAuth Apple/Google still work in both modes (regression) | FR-A1 | sign-in.test (existing) |
| Redirect sanitization preserved (protocol-relative → /home) | NFR-5 | sign-in.test (existing) |
| Sign out: clears auth+pod store, clears query cache, redirects | FR-A3, US-4 | account.test |
| Delete: confirm → user.delete() → sign-out path | FR-A4, US-5 | account.test |
| Delete cancel → no call | FR-A4 | account.test |
| `mapClerkError` covers every row above | NFR-1 | clerk-errors.test |

## Deployment preconditions (operator, not code — flag in PR)

1. Clerk dashboard (**prod** instance) subscribed to `user.deleted` → the webhook endpoint. Without it, deletes orphan the Supabase `users` row.
2. Manual QA (US-5): delete account on device A → device B's partner sees "partner removed me" on next foreground (validates the `usePodSync` path the webhook depends on).

## Analytics

Reuse `signed_in` with `{ provider: 'email' }` on verify success (both modes), matching the OAuth call
at `sign-in.tsx:54`. No new event keys required (keeps the PostHog event budget unchanged).

---

# Workflow (implementation plan)

**Strategy:** systematic · TDD · **one PR** ("finish auth").
**Contract:** Claude plans/verifies; every edit + test via `skill(codeagent)`. Lint `src/` not `.`. Branch off `main`; PR via `gh`, no AI attribution.

## Branch

```
git checkout main && git pull --ff-only
git checkout -b fix/auth-completion
```
EAS-churn + RecipeJson + PROJECT_INDEX.json stay OUT of this PR (own PR later).

## Dependency graph

```
T0 analytics provider:'email' type ─┐
T1 clerk-errors.ts (pure) ──────────┼─▶ T4 container state machine ─▶ T6 gate ─▶ T7 PR
T2 auth-method-step (presentational)┘            ▲
T3 auth-code-step  (presentational)─────────────┘
T5 settings/account (parallel to T4) ───────────────────────▶ T6
```
T0–T3 independent → **parallel**. T4 needs T0/T1/T2/T3. T5 parallel to T4. T6 hard gate. T7 ships.

## Phase 1 — Foundations (parallel, TDD)

- **T0 · Analytics `provider` union** — `src/lib/analytics.ts`: add `'email'` to `AnalyticsEventProperties['signed_in'].provider` (currently `'apple'|'google'`). _Unblocks T4's typed `capture`._ Accept: `tsc` green when `capture('signed_in',{provider:'email'})` compiles.
- **T1 · `src/lib/auth/clerk-errors.ts` + test** — pure `mapClerkError(err): {message; switchTo?}`. Read code at `err.errors[0].code` (ClerkAPIError). Cover every Design error-map row. **Test first**; 100% branch.
- **T2 · `src/components/auth/auth-method-step.tsx`** — presentational, props `{mode,onToggleMode,email,onChangeEmail,onSubmitEmail,onOAuth,pending,disabled}`. Toggle (`auth-mode-toggle`) + email + Apple/Google. **Use `DesignTokens`**, keep existing testIDs.
- **T3 · `src/components/auth/auth-code-step.tsx`** — presentational, props `{code,onChangeCode,onVerify,onResend,onChangeEmail,resendCooldown,pending,error}`. OTP (`auth-code-input`), Verify (`auth-code-verify`), Resend (`auth-code-resend`, cooldown-disabled), change-email (`auth-code-change-email`). Verify disabled until code valid.

## Phase 2 — Container (T4, depends T0–T3)

Rewire `src/app/(auth)/sign-in.tsx`: add `useSignUp`; keep `useSignIn`/`useOAuth` + redirect sanitization (29-34 verbatim). State `{mode,step,email,code,pending,error,switchTo,resendCooldown}`; transitions per Design state machine. All catches → `mapClerkError`; render switch-action when `switchTo`. Render `<AuthMethodStep>`/`<AuthCodeStep>` by step.
**Tests** (extend `(auth)/__tests__/sign-in.test.tsx`, existing mock pattern): toggle preserves email; signup happy → setActive+redirect; signin happy → setActive+redirect; wrong code stays on code step; resend cooldown + change-email; `form_identifier_exists`→switch action; OAuth + redirect-sanitization regression green.

## Phase 3 — Account screen (T5, parallel to T4)

`src/app/(app)/(tabs)/settings/account.tsx` mirroring `pod.tsx` destructive pattern.
- **Sign out** (`account-sign-out`): `useClerk().signOut()` → `useAuthStore.getState().clearUser()` → `usePodStore.getState().clearActivePod()` → `useQueryClient().clear()` → `router.replace('/(auth)/sign-in')`. No confirm.
- **Delete** (`account-delete`, destructive): `Alert.alert` confirm → `useUser().user.delete()` **first** → then sign-out teardown → redirect.
- Edit `settings/index.tsx`: add `{href:'/settings/account',label:'Account',testID:'settings-link-account'}`.
- **Tests** `settings/__tests__/account.test.tsx`: sign-out clears 3 stores + cache + redirect; delete confirm → `user.delete()` then teardown; cancel → no call.

## Phase 4 — Gate (T6)

`pnpm typecheck` · `pnpm lint` (src/) · `pnpm test` — all green, ≥80% on touched files. Self-review rubric NFR-1..5. Hard gate: no PR unless green.

## Phase 5 — Ship (T7)

Commit `feat(auth): finish sign-up/sign-in, code entry, sign-out, delete`. PR via `gh` with the **two operator preconditions** (Clerk prod `user.deleted` subscription; manual US-5 partner QA) + note EAS churn excluded. No AI attribution.

## Risks

- Clerk email_code signin: handle both one-call `create({strategy})` and `create`+`prepareFirstFactor` (resolve `emailAddressId` from `supportedFirstFactors`); assert via mocks.
- `user.delete()` needs an active session → delete BEFORE teardown (ordered in T5).
- `queryClient.clear()` AFTER `signOut()` so the guard unmounts authed screens.
- T0 must land before T4 or typed `capture` breaks typecheck.
- Partner-removed path is webhook-driven → manual QA only, not a faked Jest pass.

## Definition of done

- [ ] US-1 signup→code→onboarding · US-2 signin→code→Home · US-3 resend/change-email · US-4 sign-out clears state · US-5 delete→signed out + partner "removed me" (QA)
- [ ] typecheck+lint+test green, ≥80% touched · hardcoded colors→tokens · PR documents operator preconditions

## Next step

`/sc:implement` — execute T0–T7 via codeagent honoring the graph (Phase 1 parallel → T4 + T5 → gate → PR).
