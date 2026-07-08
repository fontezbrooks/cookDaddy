# Pod Pairing Redesign — Hybrid (code + QR + link)

Status: **Implemented (increment 1)** — see "As-built" below. Phase 2 of the troubleshooting spike.

## As-built (increment 1)

Shipped: 8-char Crockford code end-to-end. **Backend** migration `026_pod_invite_short_code.sql`
(`normalize_invite_code`, `generate_invite_code`, `create_pod_invite` mints a code + retry,
`consume_pod_invite` normalizes typed input before hashing — same raising contract as 025) + pgTAP
(`create_*` length assertion → 8; new `consume_pod_invite_normalizes_code`). **Client**: `invite-code.ts`
(format/link/sanitize), `qr-code.tsx` (pure-RN View grid via `qrcode-generator`, **no native module**),
`invite-share-card.tsx`, `join.tsx` (typed entry), `invite-error-copy.ts` (extracted shared map),
`use-create-pod-invite.ts` (surfaces the code + `share()`, no auto-Share), Home hub (Invite / Join),
Settings→Pod join link. 85 suites / 589 tests green.
Follow-up hardening: `sanitizeCodeInput` now parses the code out of a pasted share message or
invite link, and creating an invite invalidates the `pod-membership` query so Home reconciles the
solo pod immediately.

**Two design items DEFERRED (documented follow-ups), for good reasons:**
1. **In-app QR camera scanner** — needs `expo-camera` (native), which would crash the current dev client
   (broken native build). The QR encodes the deep link, so it's already scannable by the phone's built-in
   camera. Add the in-app scanner once the native build is healthy.
2. **DB brute-force rate-limiting (`pod_join_attempts`, `too_many_attempts`)** — requires converting
   `consume_pod_invite` to a non-raising, error-code-returning contract (a `RAISE` rolls back the audit
   row the limiter counts). The 8-char code is ~2^40 with 24h single-use expiry, so online guessing is
   already impractical; this is defense-in-depth, better reviewed on its own.
3. Dedicated Copy-to-clipboard buttons — need `expo-clipboard` (native); the code is selectable and the
   native Share sheet offers copy, so deferred with the scanner.

---

Prereq Phase 1 merged (PR #23). Next: `/sc:test` (run pgTAP once applied), then `/sc:git`.

Replaces the Share-sheet-only invite (`use-create-pod-invite.ts`, `invite/[token].tsx`) with a
hybrid flow: the inviter sees a **short code + QR + copy-link**; the invitee **types the code OR
scans the QR** (link deep-link retained).

## Core architectural decision — one credential, three channels

Today `create_pod_invite()` mints a 256-bit base64url token, stores only its HMAC (`pod_invites.token_hash`),
and `consume_pod_invite(raw)` hashes the input and looks up by hash (migration 017). The token is
unguessable but untypeable.

**Decision: make the invite token a short, human-typeable code.** The same code is delivered three
ways — typed, scanned (QR), or tapped (link). There is a **single** `consume_pod_invite(code)` path,
reusing the existing HMAC-store/consume-by-hash machinery. No second secret, no second column.

Rejected alternative (two-credential hybrid: keep the long link-token *and* add a `short_code` column):
more entropy on the link, but doubles the secret surface, needs a second lookup path + column, and the
link's security already collapses to whatever is easiest to brute-force. Single credential is simpler and
sufficient under this threat model (pairing two people over a shared recipe cookbook — not protecting money),
**provided** consume is rate-limited (see OQ-7).

---

## Resolved open questions

### OQ-3 — Code format & entropy
- **8 characters, Crockford base32** alphabet `0-9 A-Z` minus `I L O U` (ambiguity-free).
- Displayed grouped: `ABCD-2FGH`. Case-insensitive.
- Entropy ≈ 32^8 = 2^40 ≈ 1.1e12. Combined with single-use + 24h expiry + rate limiting, online
  guessing is infeasible (a rate cap of ~10/10min yields ≤ ~2,880 tries in 24h « 1e12).
- **Normalization (canonical form)** applied on BOTH create (before hashing) and consume (before hashing):
  uppercase → strip all non-alphanumerics (spaces/dashes) → map visually-ambiguous input `I→1, L→1, O→0, U→V`.
  Idempotent, so a user typing `abcd2fgh`, `ABCD-2FGH`, or `abcd 2fgh` all resolve identically.

### OQ-4 — Storage: reuse `token_hash`, no new column, no plaintext
- Store **HMAC(normalized code)** in the existing `pod_invites.token_hash`. Raw code never persisted
  (parity with the current token model).
- Add a **generate-and-retry loop** in `create_pod_invite()` (retry on the `token_hash` unique-violation)
  — collisions at 2^40 across live invites are astronomically rare, but the retry makes it total.
- No schema change to `pod_invites` itself for the code.

### OQ-5 — Where "Join a pod" lives
- **Home is the pairing hub** for pod-less users (it already hosts invite creation). For a user with no
  active pod, Home shows two actions:
  - **Invite your partner** → share screen (code + QR + copy-link + native share).
  - **Join a pod** → code-entry screen (typed segments + "Scan QR").
- **Settings → Pod** gets a secondary "Join a pod" link for discoverability (its empty-state CTA today is
  "Create an invite from Home", `settings/pod.tsx:66`).

### OQ-6 — QR encodes the deep link (not the raw code)
- QR encodes `https://cookdaddy.app/invite/{code}` so the phone's built-in camera can open the app via
  the existing universal link (`invite/[token].tsx`), not just the in-app scanner.
- The in-app scanner accepts either form: parse `{code}` out of a cookdaddy `invite/` URL, or take a raw
  Crockford-base32 string directly.

### OQ-7 — Rate limiting (the security-critical piece)
- New table **`pod_join_attempts(user_id text, attempted_at timestamptz)`** logging each *failed*
  `consume_pod_invite` call (wrong/expired/not-found code) by the authenticated caller.
- In `consume_pod_invite`, before lookup: if the caller has **≥ 10 failed attempts in the last 10 minutes**,
  raise `too_many_attempts`. On success, no log.
- Daily prune (pg_cron, alongside existing prunes) drops rows older than 24h.
- New `PodRpcErrorCode`: `too_many_attempts`.

---

## Backend design

### Migration `026_pod_invite_short_code.sql`
1. **`pod_join_attempts` table** + index on `(user_id, attempted_at)`; RLS: no client access (SECURITY
   DEFINER only), consistent with `pod_members`.
2. **`normalize_invite_code(text) → text`** — pure SQL, the OQ-3 normalization. Used by both RPCs.
3. **Rewrite `create_pod_invite()`** — generate an 8-char Crockford-base32 code (from
   `gen_random_bytes`), normalize, HMAC → insert; retry on unique violation (bounded loop, e.g. 5 tries).
   Return `code` (aliased through the existing `token` out-param to avoid breaking the return shape) +
   `expires_at` + `pod_id`. 24h TTL unchanged.
4. **Rewrite `consume_pod_invite(p_token text)`** — normalize input → HMAC → existing lookup/guards.
   Prepend the rate-limit check; log a `pod_join_attempts` row on each guard failure. All existing error
   codes and the idempotent re-tap semantics preserved.
5. **Secret**: still HMAC via `app.pod_invite_secret` GUC — **the pre-launch HIGH item to rotate off the
   dev fallback (`017:37-40`) is now more important**, because a shorter code leans harder on the secret +
   rate limit. Flag in the migration header.

### Backward-compat / cutover
- Existing long base64url invites in flight: consume now normalizes input, which would alter a base64url
  string and miss the old hash. Old unconsumed invites die within 24h of deploy regardless, so the window
  is self-healing. **Deploy note:** communicate a ≤24h transition, or drain by leaving old consume path
  tolerant (normalize only if input matches the code alphabet). Recommended: accept the 24h self-heal;
  keep it simple.

### API contract (`src/lib/pod-rpcs.ts`)
- `PodInvite` gains a semantic rename in the wrapper: expose `code` (still fed by the RPC `token` field)
  while keeping `token` as a deprecated alias for one release, or rename outright — implementation choice.
- Add `too_many_attempts` to `PodRpcErrorCode` + `KNOWN_CODES`.
- `consumePodInvite(supabase, code)` — unchanged signature; caller passes the typed/scanned/parsed code.

---

## Client design

### New/changed screens & components
- **`InviteShareCard`** (inviter): shows `ABCD-2FGH` (Copy), QR of the deep link, "Copy link", and keeps
  the native Share action. Replaces the fire-and-forget Share-sheet in `use-create-pod-invite.ts`
  (`onSuccess` no longer auto-opens Share; it renders the card).
- **`JoinPodScreen`** (invitee): segmented 8-char code input (paste-aware, auto-uppercase, auto-format
  into two groups), a "Scan QR" button, inline error copy reusing the `ERROR_COPY` map from
  `invite/[token].tsx` (extended with `too_many_attempts`).
- **`QrScannerSheet`**: `expo-camera` `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`;
  on scan → parse code from URL-or-raw → `consume`. Camera permission prompt + rationale + manual-entry
  fallback if denied.
- **Home hub**: pod-less state renders "Invite your partner" + "Join a pod".
- **`invite/[token].tsx`**: unchanged behavior; the `[token]` param is now a short code (still just a
  string). Add `too_many_attempts` copy.

### Dependencies (new — all dev-build compatible, per dev-build-only decision)
- **Scanning**: `expo-camera` (Expo SDK module; `CameraView` barcode scanning).
- **QR display**: render a QR matrix from a **pure-JS encoder** (`qrcode`) using the **already-installed
  `@shopify/react-native-skia`** — no new native module. *Alternative:* `react-native-qrcode-svg` +
  `react-native-svg` (simpler code, one extra native module). Recommend the Skia path to avoid adding
  native surface.

### State / analytics
- No new Zustand surface; pairing still resolves to `usePodStore.activePodId` via the existing consume →
  partner-fetch path.
- Analytics: existing `match_first_ever` / pod group events unaffected. Optionally add a
  `pod_join_method: 'code' | 'qr' | 'link'` property to an existing pairing event (design-optional; not
  in the current §17.1 taxonomy — would need a taxonomy entry in `analytics.ts`).

---

## Acceptance criteria
- Inviter sees code + QR + copy-link on one screen; all three encode the same invite.
- Invitee joins by typing the code (any case / with or without dash) OR scanning the QR OR tapping the link.
- All existing invite guards intact (`invite_not_found`, `invite_expired`, `invite_already_consumed`,
  `cannot_consume_own_invite`, `consumer_already_in_a_pod`, `pod_full`, `already_in_a_pod`) + new
  `too_many_attempts`.
- Rate limit blocks brute force (≥10 failures/10min → `too_many_attempts`), self-prunes daily.
- Camera-denied path degrades to manual entry.

## Test strategy
- **pgTAP** (mind the gotchas in `project_pgtap_ci_gotchas`): test `normalize_invite_code` idempotency;
  create→consume happy path with a typed-format code; rate-limit trip at the threshold; use
  `has_function_privilege` (not `throws_ok '42501'`) for grant checks; seed complete recipes if catalog-dependent.
- **Client**: normalization/format unit tests; `JoinPodScreen` submit + error copy; `QrScannerSheet` URL/raw
  parsing; mock `expo-camera`. Keep coverage ≥ 90% lines.

## Out of scope
- Rotating `app.pod_invite_secret` (separate HIGH item — but now higher urgency; note in migration).
- Analytics taxonomy expansion for `pod_join_method` (optional follow-up).
