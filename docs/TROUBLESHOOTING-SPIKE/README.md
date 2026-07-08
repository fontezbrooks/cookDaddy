# Troubleshooting Spike — Launch Errors + Pod-Pairing Redesign

Status: **Requirements (brainstorm output).** Next: `/sc:design` (pairing) → `/sc:workflow` / `/sc:implement`.
Owner decisions captured 2026-07-07.

## Goal

Two-phase spike:

1. **Phase 1 — Clean launch.** Eliminate the errors/warnings that appear on app start so the
   development build boots without red/yellow noise.
2. **Phase 2 — Pod-pairing redesign.** Replace the awkward Share-sheet invite link with a
   hybrid pairing flow (short code + QR + copy link).

Delivered as **two separate PRs** — Phase 1 first (get to a clean boot), Phase 2 after.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Expo Go support | **Dev-build-only; keep MMKV** | `react-native-mmkv` v4 is a native TurboModule Expo Go does not ship. Expo Go is structurally impossible for this app. Dev builds already work. |
| Pairing mechanism | **Hybrid: typed code + QR + copy link** | Invitee can type a short code OR scan a QR; link retained as fallback. |
| Sequencing | **Fixes first, then pairing** | Two PRs; clean boot before the enhancement. |

---

## Root-cause map (why the errors happen)

Most launch errors collapse to two roots.

### Root A — Installed dev-client binary is stale vs. current native module set
A prebuild + rebuild of the dev client resolves both of these:

- **Nitro version mismatch** — `WARN native 0.35.7 vs JS 0.35.10`.
  `package.json` pins `react-native-nitro-modules: ^0.35.7`; `react-native-mmkv@4.3.2` resolves
  `0.35.10` in `pnpm-lock.yaml`. The compiled binary baked in 0.35.7; JS runs 0.35.10.
- **`ExpoBlurView` unimplemented / faint pink text on the Cookbook header** — the overlay is
  `BlurView` in `src/components/app-bar.tsx:21`. The native `ExpoBlur` view is missing from the
  running binary (built before expo-blur was linked).

### Root B — `react-native-mmkv` makes Expo Go impossible (accepted constraint, not a bug)
`Failed to get NitroModules` crash chain: `mmkv.ts:8` → `useSettingsStore.ts:14` →
`use-reduced-motion.ts` → `tab-bar-icon.tsx`. MMKV v4 is a native TurboModule absent from Expo Go.
**Resolution: document dev-build-only; no code change to MMKV.**

### Independent JS-only fixes (no rebuild required)
- **`usePostHog` / `useFeatureFlag` ERRORs** — `_layout.tsx:139` mounts `<PostHogProvider>` only
  when `extra.posthogKey` is set, but `AnalyticsIdentity` (`use-analytics-identity.ts`) and
  `useDeckSizeFlag` (`use-deck-size-flag.ts:27`) call the hooks unconditionally. No key in dev →
  no provider → hooks error.
- **`Sentry.wrap called before Sentry.init`** — `Sentry.init` gated on `extra.sentryDsn`
  (`_layout.tsx:56`) but `Sentry.wrap(RootLayout)` always runs (`:149`).
- **`onAnimatedValueUpdate with no listeners` (×21)** — benign Reanimated/tab-bar noise; lowest priority.
- **Clerk dev-keys warning** — expected in dev; tracked separately as the pre-launch prod-key task.

---

## Phase 1 — Requirements: Clean launch

### FR-1 Nitro version alignment
- Pin `react-native-nitro-modules` to the version MMKV requires (`0.35.10`) so native and JS match.
- Rebuild the dev client so the binary and JS bundle agree.
- **AC:** No "native Nitro Modules core runtime version" warning on launch.

### FR-2 Blur view restored
- After rebuild, `ExpoBlur` native view is present.
- **AC:** No "Unable to get view config for ExpoBlurView" warning; no faint pink text behind the
  Cookbook (and any other `app-bar`) header.
- **Open question OQ-1:** If a rebuild is undesirable per-change, do we want `app-bar` to degrade
  gracefully (solid tinted background) when `BlurView` native view is unavailable? (Resilience vs. simplicity.)

### FR-3 PostHog hooks tolerate a missing client
- Analytics consumers must not error when no `PostHogProvider` is mounted (dev / CI with no key).
- Preferred: guard `usePostHog`/`useFeatureFlag` usage so absence is a no-op (capture/flag → default).
- **AC:** No `usePostHog was called without a PostHog client` or `useFeatureFlag ...` errors in dev.
- **AC:** With a key set, capture/identify/group/flags still function unchanged.
- **Open question OQ-2:** Do you want analytics *active* in dev (wire a dev PostHog key) or *silent*
  in dev (guard only)? Default assumption: silent in dev.

### FR-4 Sentry init/wrap ordering
- `Sentry.init` runs before `Sentry.wrap` takes effect, regardless of DSN presence (use `enabled: !!dsn`).
- **AC:** No "App Start Span could not be finished / Sentry.wrap was called before Sentry.init" warning.
- **AC:** With no DSN, Sentry is inert (no network, no crash).

### FR-5 Dev-build workflow documented (Expo Go decision)
- Document that this app requires a development build; Expo Go is unsupported and why (MMKV/nitro).
- **AC:** A short "Running the app" note exists covering dev-client build + connect; no instruction
  references Expo Go as a supported path.

### NFR (Phase 1)
- No regression in the existing test suite (73 suites / 538 tests per project baseline).
- `eslint src/` clean (lint scoped to `src/`, not `.`).
- No new runtime errors/warnings introduced on launch.
- Reanimated `onAnimatedValueUpdate` noise: **out of scope** unless trivially silenced; documented as accepted.

---

## Phase 2 — Requirements: Hybrid pod pairing

Replaces the Share-sheet `https://cookdaddy.app/invite/{uuid}` flow
(`use-create-pod-invite.ts`, `invite/[token].tsx`).

### User stories
- **US-1 (Inviter):** As a pod creator, I see a short human-readable code, a QR, and a copyable link
  on one screen, so I can pair with my partner in person or remotely over any channel.
- **US-2 (Invitee — code):** As an invitee, I can type the short code into a "Join a pod" field to join.
- **US-3 (Invitee — QR):** As an invitee, I can scan the inviter's QR to join.
- **US-4 (Invitee — link):** As an invitee, tapping the copied link still joins (backward-compatible).

### Functional requirements
- **FR-6** Invite creation issues a **short, human-friendly code** (e.g. `COOK-4F2K`) alongside the
  existing token. Code is case-insensitive on entry, unambiguous alphabet (no O/0, I/1), 24h expiry
  (matches current invite lifetime).
- **FR-7** Inviter screen renders: code (with Copy), QR encoding the join payload, and Copy-link.
- **FR-8** "Join a pod" entry: invitee types the code → consume → join pod → route to /home.
- **FR-9** QR scan path: camera scans QR → same consume path.
- **FR-10** All existing invite guard rails preserved: `invite_not_found`, `invite_expired`,
  `invite_already_consumed`, `cannot_consume_own_invite`, `consumer_already_in_a_pod`, `pod_full`,
  `already_in_a_pod`. Code entry surfaces the same error copy as the link flow
  (`invite/[token].tsx` ERROR_COPY).
- **FR-11** Existing deep-link `invite/[token].tsx` continues to work (hybrid = link retained).

### Non-functional / constraints
- **Dependencies (new):** QR display + QR/barcode scanning (camera). Both require the dev build —
  acceptable under the dev-build-only decision. Camera needs a permission prompt + rationale.
- **Backend:** reuse existing `create_pod_invite` / `consume_pod_invite` RPCs; add short-code
  generation + a consume-by-code path (design-phase detail; may be a new column + RPC or code→token lookup).
- **Security:** short code must be rate-limited / non-enumerable enough to resist guessing within the
  24h window (design-phase: entropy vs. usability tradeoff for code length/alphabet).
- **A11y:** code field supports paste; QR has a text alternative (the code) always visible.

### Open questions for `/sc:design`
- **OQ-3:** Short-code format — length + alphabet + entropy target vs. typeability (e.g. 6 vs 8 chars).
- **OQ-4:** Store a dedicated `short_code` column on the invite row, or derive/lookup? Migration impact.
- **OQ-5:** Where does "Join a pod" live — Home, Settings → Pod, or onboarding? (Current empty-state
  CTA is "Create an invite from Home", `settings/pod.tsx:66`.)
- **OQ-6:** QR payload — encode the deep link (reuses `invite/[token]`) or the raw short code?
- **OQ-7:** Rate-limit / lockout policy on wrong code attempts.

---

## Out of scope (this spike)
- Clerk production keys (tracked as pre-launch task).
- Rotating `app.pod_invite_secret` off the dev fallback (separate HIGH security item).
- Reanimated `onAnimatedValueUpdate` noise beyond trivial suppression.
- Any MMKV replacement / Expo Go support (explicitly rejected).
