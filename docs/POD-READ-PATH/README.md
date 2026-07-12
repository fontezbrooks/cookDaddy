# Pod Membership Read-Path Rebuild — Requirements

**Status:** Requirements (brainstorm output, 2026-07-11). Design/implementation not started.
**Scope decision:** Rebuild the client read path only. Server pairing semantics from
migrations 025/026 (short codes, TTL, 2-member cap, idempotent solo-create — see
`docs/POD-PAIRING/README.md`) are correct and out of scope.

## 1. Problem statement

On a device against cloud prod, Home renders the "No pod yet" empty state while
`create_pod_invite` rejects with `already_in_a_pod` — both at once (screenshot
2026-07-11). Separately, deep-linking to `/settings/profile` from Home strands the
Settings tab on the profile screen with no way back.

## 2. Root cause (verified in code)

Two identity/trust paths disagree:

| Path | Mechanism | Status |
|---|---|---|
| Mutations (`create_pod_invite`, `consume_pod_invite`, `dissolve_pod`) | `SECURITY DEFINER` RPC, resolves caller via `auth_user_id()` | **Works** (it produced the error) |
| Membership read (`use-pod-membership.ts`) | PostgREST + RLS (`pm_read` → `is_pod_member`) + `pods!inner` join | **Silently returns 0 rows** on device |

Compounding client defects:

- `usePodSync` (`src/lib/use-pod-sync.ts:31-59`) ignores `membership.error`; a failed
  read is indistinguishable from "no pod".
- `usePodStore` is memory-only; one bad read at cold start poisons the whole session.
- UI treats store-empty as authoritative: "Leave pod" is hidden, and the `8a978da`
  fallback (`effectivePodId`) falls back to the same broken query → soft-lock.
- `fetchPartnerForPod` is a second RLS-dependent read with the same fragility.
- On `already_in_a_pod`, the hint says "Reload to see your pod" but reload re-runs the
  broken read; the client never self-heals.

Settings trap (independent bug): `settings/_layout.tsx` has no `initialRouteName`
anchor, so `Link href="/settings/profile"` from Home creates the settings stack with
profile as its only entry; `router.back()` cannot pop and the tab restores the stuck
stack.

Prod state assumption (user-confirmed): the 2-member pod on cloud is likely a **real
pairing** from earlier testing. No server data cleanup is in scope; once the read path
is fixed, Home should show the paired state.

## 3. Goals

1. The client's belief about pod membership always converges to server truth, or
   visibly reports that it cannot.
2. No state the app can enter is unrecoverable from the UI.
3. Settings navigation can never strand the user.

## 4. Functional requirements

**FR-1 — Single authoritative read RPC.** A `get_my_pod()` RPC (SECURITY DEFINER, same
`auth_user_id()` identity resolution as the mutation RPCs) returns in one call: active
`pod_id` (non-archived), partner user id + display name (null when solo), and member
count. The client membership query calls this RPC. The RLS-scoped `pod_members` read
and the separate `fetchPartnerForPod` read are retired from the sync path.

**FR-2 — Error is a first-class state.** The pod store distinguishes
`unknown | error | none | solo | paired`. The "No pod yet" empty state renders only
after a **successful** read returns none. On error, Home shows a retry affordance, not
the invite CTA.

**FR-3 — Self-healing on contradiction.** When any pod RPC returns
`already_in_a_pod` / `consumer_already_in_a_pod`, the client invalidates and refetches
membership automatically. The "reload to see your pod" copy is replaced by the refetch
(and updated if a hint is still needed).

**FR-4 — Unconditional escape hatch.** A no-arg `leave_my_pod()` RPC resolves the
caller's membership server-side and dissolves/leaves accordingly. Settings → Pod shows
"Leave pod" whenever the **server** says a pod exists — never gated on the client
store alone.

**FR-5 — Settings stack anchoring.** The settings stack declares
`initialRouteName: 'index'` (via `unstable_settings`), so deep links to child screens
always have the hub beneath them. `AppBar` back falls back to
`router.replace('/settings')` when `router.canGoBack()` is false.

**FR-6 — Diagnostics visibility.** Membership read failures emit a PostHog event
(respecting existing consent gating) including error code/message, so silent read
failures are observable in prod.

## 5. Non-functional requirements

- **NFR-1** No new dependencies (deps-diet stands).
- **NFR-2** New RPC covered by pgTAP; note repo gotcha — use `has_function_privilege`
  instead of anon `throws_ok` 42501 probes; seed complete fixtures.
- **NFR-3** Client changes covered by Jest at the repo bar (80%+ branch); state
  transitions of the new store states each have a test.
- **NFR-4** RLS posture unchanged or tightened; `get_my_pod` exposes only the caller's
  own pod/partner (no enumeration), EXECUTE revoked from anon.
- **NFR-5** Works in Expo Go (no native modules).
- **NFR-6** One new migration (next number after 026), applied via user-run
  `supabase db push` (CLI SIGKILLs in this environment).

## 6. Acceptance criteria

1. Cold start, paired user, healthy network → Home shows paired state; never flashes
   "No pod yet".
2. Cold start with the membership RPC failing → Home shows an error/retry state; invite
   CTA absent; retry after recovery reaches paired state.
3. `create_pod_invite` → `already_in_a_pod` → membership refetches automatically and
   the UI flips to the paired state without app reload.
4. With an empty client store but server-side membership, Settings → Pod still offers
   Leave pod, and `leave_my_pod()` succeeds.
5. From Home, tap "Set up your profile" → back returns to a working Settings hub; the
   Settings tab is never stuck on profile.
6. All existing pairing tests (025/026 semantics) still pass unchanged.

## 7. Out of scope

- Any change to invite/consume/dissolve semantics, codes, TTLs, caps.
- Server data cleanup on prod (pairing assumed real).
- QR camera scanner, DB rate-limit, copy-to-clipboard (already deferred, see
  `docs/POD-PAIRING/README.md`).
- Persisted pod store (revisit only if error-state UX proves insufficient).

## 8. Open questions

1. Should `get_my_pod()` also replace the other RLS reads of pod tables in session
   flows, or is that a follow-up sweep?
2. Does `leave_my_pod()` fully supersede `dissolve_pod(pod_id)` client-side (retire the
   arg-taking call), or do both remain?
3. Home "empty state" flash budget: is a brief skeleton acceptable while state is
   `unknown`, or must Home hold the previous rendered state?

## 9. Next step

`/sc:design` (or `/sc:implement` directly, given the small surface) against this spec.
Branch note: current work sits on `refactor/deps-diet` (2 commits ahead of main,
including the `8a978da` partial fix this spec supersedes) — merge or branch off it
before starting.
