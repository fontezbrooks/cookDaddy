# cookDaddy — Implementation Workflow

**Status:** Draft v1
**Owner:** Fontez Brooks
**Last updated:** 2026-05-21
**Source docs:** [PRD](../PRD/README.md) · [DESIGN](../DESIGN/README.md) · [MATCH-UX](../MATCH-UX/README.md)
**Scope:** Phase-gated implementation plan from empty repo to App Store / Play Store submission. No code in this doc.

> **Next step after this doc:** Use `/sc:implement` per phase. Each phase has an explicit exit criterion below.

---

## 0. Workflow Philosophy

1. **TDD-first.** No production code lands without a failing test that motivated it. 90% line coverage enforced in CI (NFR-Q2).
2. **Vertical slices over horizontal layers.** Each phase ships an end-to-end demonstrable behavior, not a partial layer.
3. **Schema before client.** RLS is the security model — get it right and tested before any client trusts the DB.
4. **The hot path gets pgTAP.** Match detection, deck building, and RLS policies are validated in SQL-level tests, not just app-level mocks.
5. **One PR per phase exit criterion** by default; smaller is fine, bigger needs justification.
6. **Don't break what works.** Each phase ends green. If a phase destabilizes the previous, fix forward in that phase — don't accumulate debt.
7. **Effort sizes, not dates.** Solo dev cadence; XS = hours, S = ~1 day, M = ~2–3 days, L = ~1 week, XL = >1 week.

---

## 1. Phase Map

```
Phase 0  ──► Phase 1  ──► Phase 2  ──┬─► Phase 3 (ingestion) ──┐
                                     └─► Phase 4 (app shell) ──┴─► Phase 5 ──► Phase 6 ──► Phase 7 ──► Phase 8
                                                                                                      │
                                          ┌───────────────────────────────────────────────────────────┘
                                          ▼
                                       Phase 9  ──┐
                                       Phase 10 ──┼─► Phase 11 ──► Phase 12 ──► Phase 13
                                       Phase 9.5 ─┘  (push)        (analytics)   (polish + store)
                                       (cookbook)
```

| # | Phase | Effort | Depends on | Parallel with |
|---|---|---|---|---|
| 0 | Repo bootstrap + CI + tooling | S | — | — |
| 1 | Schema + RLS + pgTAP foundation | L | P0 | — |
| 2 | Auth bridge (Clerk ↔ Supabase) | M | P1 | — |
| 3 | Recipe ingestion → Supabase | M | P2 | P4 |
| 4 | Mobile app shell + Clerk + Supabase clients | M | P2 | P3 |
| 5 | Pod lifecycle (invite / consume / dissolve / partner-removed-me) | M | P3, P4 | — |
| 6 | Session core (start, lobby, presence, end) | M | P5 | — |
| 7 | Swipe RPC + match-detection (the hot path) | L | P6 | — |
| 8 | Match overlay UX (motion / haptics / variants / settings) | L | P7 | — |
| 9 | Cookbook + ratings + notes | M | P7 | P10 |
| 10 | Shopping list + pantry (CRUD + realtime + pantry-aware add) | M | P5 | P9 |
| 11 | Push notifications (permission + Expo fan-out) | M | P5, P6 | P12 |
| 12 | Analytics (PostHog events + group analytics) | S | P5 | P11 |
| 13 | Polish + a11y audit + perf + E2E + store submission | L | All | — |

**Critical path:** P0 → P1 → P2 → P4 → P5 → P6 → P7 → P8 → P13. Everything else can be sequenced opportunistically around the path.

---

## 2. Cross-Cutting Quality Gates

Run on every PR. Fail CI on any red gate.

| Gate | Tool | Threshold |
|---|---|---|
| Lint | ESLint + Prettier | Zero errors |
| Typecheck | `tsc --noEmit` strict | Zero errors |
| Unit + component | Jest + @testing-library/react-native | Coverage ≥ 90% lines (with budgets per package) |
| SQL/RLS | pgTAP via `supabase test db` | All assertions pass |
| Integration (server) | Jest against local Supabase | All tests pass |
| Secret scan | `gitleaks` pre-commit + CI | Zero findings |
| Dep audit | `npm audit --audit-level=high` | Zero high/critical |
| Bundle size | EAS build size check | iOS < 50MB / Android < 40MB (warn at 80% of cap) |
| E2E smoke (from P13) | Maestro on two simulators | Critical flows pass |

A phase is **not done** until all gates are green on its delivery PR.

---

## 3. Phase 0 — Repo Bootstrap + CI + Tooling

**Effort:** S
**Goal:** A green CI run on an empty `App.tsx`. No product features. Just the rails.

### Tasks
- [ ] Initialize Expo TypeScript app: `npx create-expo-app@latest cookdaddy --template default`.
- [ ] Migrate to expo-router (file-based routing).
- [ ] TS strict mode in `tsconfig.json`.
- [ ] ESLint + Prettier configured; Husky pre-commit running lint + format + gitleaks.
- [ ] Jest + @testing-library/react-native configured; `--coverageThreshold` set to 90%.
- [ ] GitHub Actions workflow `.github/workflows/ci.yml`: install → lint → typecheck → test → upload coverage artifact.
- [ ] EAS Build configuration (`eas.json`) for development + preview + production profiles. No store submission yet.
- [ ] Folder skeleton: `app/`, `src/lib/`, `src/state/`, `src/components/`, `supabase/migrations/`, `supabase/tests/`, `scripts/ingestion/`, `docs/`.
- [ ] `.env.example` documenting all expected env vars (Clerk publishable key, Supabase URL/anon-key, PostHog key, Sentry DSN).
- [ ] `.env` (gitignored), wired via `expo-constants` + `app.config.ts`.
- [ ] README pointing at this docs tree.

### Tests required
- A trivial smoke test for `App.tsx` rendering.
- A CI run that fails coverage if you delete that one test (proves the threshold works).

### Exit criteria
- CI passes on `main`.
- `eas build --profile development` succeeds locally for at least iOS simulator.
- `npm run lint`, `npm run typecheck`, `npm test` all pass and are wired into CI.

---

## 4. Phase 1 — Schema + RLS + pgTAP Foundation

**Effort:** L
**Goal:** Every table from DESIGN §3 exists, with policies, and **pgTAP tests prove the RLS policies work**.

### Tasks
- [ ] `supabase init` and confirm local instance from `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` works.
- [ ] One migration per concern (better than one mega-migration). Order:
  - [ ] `001_enums.sql` — enums from DESIGN §3.1.
  - [ ] `002_users.sql`
  - [ ] `003_dietary_profiles.sql`
  - [ ] `004_pods_and_members.sql` + `check_one_active_pod` trigger.
  - [ ] `005_pod_invites.sql`
  - [ ] `006_recipes_and_ingredients.sql`
  - [ ] `007_sessions.sql` + `check_pod_full` trigger.
  - [ ] `008_swipes.sql`
  - [ ] `009_matches.sql`
  - [ ] `010_ratings_notes.sql`
  - [ ] `011_shopping_list.sql`
  - [ ] `012_pantry.sql`
  - [ ] `013_push_tokens.sql`
  - [ ] `014_helpers.sql` — `is_pod_member()`, `auth_user_id()`.
  - [ ] `015_rls_enable.sql` — `alter table ... enable row level security` for all.
  - [ ] `016_rls_policies.sql` — all policies from DESIGN §3.5.
- [ ] pgTAP test files in `supabase/tests/` mirroring migrations.
- [ ] `supabase test db` wired into CI.

### Tests required (pgTAP)
Each is a separate `.sql` file in `supabase/tests/`:
- [ ] `users_self_only_writes.sql` — user can update self, can't update another user.
- [ ] `dietary_profiles_strict_self.sql` — partner cannot SELECT their partner's dietary row.
- [ ] `pods_member_only.sql` — non-member gets zero rows for every pod table.
- [ ] `pod_one_active_per_user.sql` — second insert into `pod_members` for same user (active) raises.
- [ ] `pod_must_have_two_for_session.sql` — `sessions` insert fails with 1-member pod.
- [ ] `swipes_self_only_insert.sql` — `INSERT INTO swipes (user_id = other)` fails.
- [ ] `matches_unique_per_pod_recipe.sql` — second match insert returns no row (on conflict do nothing).
- [ ] `recipes_public_read_authed.sql` — anon role gets zero rows; authed role sees all.
- [ ] `pod_invites_owner_only.sql` — non-inviter cannot read.

### Exit criteria
- `supabase db reset` followed by `supabase test db` runs all pgTAP tests green.
- A scripted "simulate two Clerk users" helper in `supabase/tests/_helpers.sql` lets us set `request.jwt.claims` to test RLS.
- Coverage stays ≥ 90% (no app code yet, but Jest passes).

---

## 5. Phase 2 — Auth Bridge (Clerk ↔ Supabase)

**Effort:** M
**Goal:** A signed-in mobile user can read their own `users` row via Supabase using a Clerk-issued JWT. Webhook-driven sync keeps `users` table in step with Clerk.

### Tasks
- [ ] Configure Clerk JWT template `supabase` with claims from DESIGN §4.
- [ ] Set Supabase `JWT_SECRET` to Clerk's signing key.
- [ ] Add `auth_user_id()` SQL function verified to return `request.jwt.claims->>'sub'`.
- [ ] Edge Function `clerk-user-webhook`:
  - [ ] Verifies Svix signature.
  - [ ] On `user.created` / `user.updated` → upserts row in `users` (id = Clerk user id, display_name from primary email / name claim).
  - [ ] On `user.deleted` → soft path: archive any active pod the user is in, delete the user row (cascades).
- [ ] Mobile-side fallback: on first authenticated app launch, if no row exists in `users` for the JWT `sub`, upsert from client (RLS allows self-insert as a one-time write).
- [ ] Wire `@supabase/supabase-js` client in `src/lib/supabase.ts` with Clerk token fetcher.

### Tests required
- [ ] **Integration:** spin up local Supabase, mint a JWT for fake user "alice", read `users` table → returns only alice's row.
- [ ] **Integration:** verify a Clerk webhook payload via Svix signing, then upserts `users`.
- [ ] **Unit:** webhook handler rejects bad signatures.
- [ ] **pgTAP:** an unauthenticated request gets denied by RLS on every pod-scoped table.
- [ ] **Component (later in P4 but mock here):** Supabase client correctly attaches the Clerk JWT bearer.

### Exit criteria
- A real Clerk-signed user can sign in via the mobile app shell (Phase 4 placeholder screen acceptable) and the `users` row materializes.
- Webhook delivery from Clerk dashboard's test event arrives at the Edge Function and mutates `users`.
- Test user with mismatched JWT cannot access another user's data.

---

## 6. Phase 3 — Recipe Ingestion → Supabase

**Effort:** M
**Goal:** The existing hourly Spoonacular cron also populates `recipes` + `recipe_ingredients`. Catalog grows automatically.

### Tasks
- [ ] Node script `scripts/ingestion/import-spoon.ts`:
  - [ ] Reads all `*.json` from `RecipeJson/`.
  - [ ] Maintains a `RecipeJson/.imported.json` ledger to skip already-processed files.
  - [ ] Normalizes each Spoonacular payload → `recipes` row + `recipe_ingredients` rows.
  - [ ] Computes `dietary_flags` from Spoonacular boolean fields (vegan, vegetarian, glutenFree, dairyFree, etc.).
  - [ ] Sets `is_complete = false` when missing instructions/image/ingredients.
  - [ ] Idempotent upsert on `recipes.external_id`.
- [ ] Update `setup-spoon-cron.sh` to chain: `test-spoon.ps1` → `node scripts/ingestion/import-spoon.ts`.
- [ ] Backfill: one-off `npm run ingest:backfill` to import all existing JSON files.
- [ ] Track an `recipe_apparent_duplicate` PostHog event when title-similarity to existing recipe > 0.85 (for sizing post-MVP fuzzy dedup); no de-dup action taken.

### Tests required
- [ ] **Unit:** `normalizeSpoonRecipe()` snapshots from `RecipeJson/Best_Buffalo_Chicken_Chili.json` → expected row shape.
- [ ] **Unit:** missing-field handling produces `is_complete = false` instead of crashing.
- [ ] **Integration:** running the importer twice against local Supabase produces the same row count (idempotency).
- [ ] **Integration:** ingredients are stably ordered by `position`.

### Exit criteria
- `npm run ingest:backfill` populates Supabase with all existing `RecipeJson/*` files; row count visible.
- Cron successfully runs the importer with each Spoonacular fetch (logs visible in `/tmp/spoon.log` or wherever cron writes).
- Empty payloads / API errors don't break the cron (script exits 0 with logged warning).

---

## 7. Phase 4 — Mobile App Shell

**Effort:** M
**Goal:** A signed-in user lands on a placeholder home screen, sees their `users` row's display_name, and can navigate the empty shells of every future screen.

### Tasks
- [ ] expo-router structure per DESIGN §8.3 — all routes scaffolded as placeholders.
- [ ] `(auth)/sign-in.tsx` — Clerk `<SignIn />` with Apple + Google + Email.
- [ ] `(app)/_layout.tsx` — protected layout requires Clerk session, otherwise redirects to sign-in. Mounts Supabase client + PostHog identify (group analytics on pod added later in P12).
- [ ] `(app)/home.tsx` — placeholder showing user name and "No pod yet" empty state.
- [ ] `(app)/settings/profile.tsx` — name + avatar edit (writes to `users`).
- [ ] `(app)/settings/dietary.tsx` — chip selector writing to `dietary_profiles` (private to user).
- [ ] `(app)/settings/vibes.tsx` — empty stub (filled in P8) with toggles for haptics / sound / animations.
- [ ] `(app)/settings/notifications.tsx` — toggle per-type (filled in P11).
- [ ] Zustand `useAuthStore` and `usePodStore` (skeleton).
- [ ] TanStack Query provider configured; default `staleTime` tuned per route.
- [ ] Sentry initialized at app bootstrap.
- [ ] Custom `cookdaddy://` URL scheme + Universal Link config in `app.config.ts` (handler comes in P5).

### Tests required
- [ ] **Component:** sign-in screen renders, protected layout redirects when no Clerk session.
- [ ] **Component:** dietary chip selector writes to `dietary_profiles` and only the owning user can read it back (RLS smoke via mocked Supabase client).
- [ ] **Unit:** Zustand stores hydrate/dehydrate from MMKV.

### Exit criteria
- App boots → sign-in → home with name.
- Dietary screen persists changes across restarts.
- All future routes visible (placeholders) — proves routing structure.

---

## 8. Phase 5 — Pod Lifecycle

**Effort:** M
**Goal:** Two users can pair via a share-link and dissolve cleanly. Partner-removed-me UX is in place.

### Tasks

#### Server (Postgres + Edge Functions)
- [ ] RPC `create_pod_invite()`:
  - [ ] If caller has no active pod, create one (with caller as sole member), then issue invite.
  - [ ] Generate 32-byte random token; store `hmac_sha256(token, server_secret)`; expiry 24h.
  - [ ] Return raw token + expiry to caller (one-time).
- [ ] RPC `consume_pod_invite(token text)`:
  - [ ] Hashes token, looks up `pod_invites`.
  - [ ] Rejects if expired, consumed, or caller already in a pod.
  - [ ] Adds caller to inviter's pod via `pod_members` (trigger enforces 1-active-pod).
  - [ ] Marks invite consumed.
  - [ ] Returns `pod_id`.
- [ ] RPC `dissolve_pod(pod_id uuid)`:
  - [ ] Verifies caller is member.
  - [ ] Sets `pods.archived_at = now()`.
  - [ ] Broadcasts `pod.dissolved` on `pod:{pod_id}` channel with `dissolved_by_user_id`.
  - [ ] Schedules a cleanup job (Postgres pg_cron) to hard-delete archived pods after 30 days.

#### Client (Expo)
- [ ] `(app)/invite/[token].tsx` — accepts invite per DESIGN §8.3 sequence.
- [ ] "Invite partner" CTA on `home.tsx` → calls `create_pod_invite` → opens native share sheet with `https://cookdaddy.app/i/{token}`.
- [ ] Settings → "Pod" → "Leave pod" → confirm → `dissolve_pod`.
- [ ] **Partner-removed-me screen** `(app)/pod-ended.tsx` per FR-P6 + DESIGN §16.1:
  - [ ] App-launch effect compares MMKV `self_dissolved_at` to server state; if partner dissolved, route here.
  - [ ] CTAs: "Invite someone new" (calls `create_pod_invite`) / "Maybe later".
- [ ] Subscribe to `pod:{pod_id}` channel on home mount; listen for `pod.dissolved` to handle partner-initiated dissolution in real time.

### Tests required
- [ ] **pgTAP:** invite token must be single-use; second consumption fails.
- [ ] **pgTAP:** consumer-already-in-pod path returns error.
- [ ] **pgTAP:** dissolving a pod sets `archived_at` and `is_pod_member` becomes false on next call.
- [ ] **Integration:** two simulated JWTs — invite → consume → both are members.
- [ ] **Component:** invite acceptance screen renders all three error states (expired, already-in-pod, success).
- [ ] **Component:** `pod-ended` screen renders correctly with both CTAs.
- [ ] **Integration:** dissolution broadcast received by partner client (mocked).

### Exit criteria
- End-to-end on two physical devices: Alice invites Bob via iMessage link → Bob signs in → tap link → both see each other in a pod within ~3s.
- Either partner dissolving routes the other to `pod-ended`.
- A user already in a pod cannot accept a second invite.

---

## 9. Phase 6 — Session Core (Start, Lobby, Presence, End)

**Effort:** M
**Goal:** A paired pod can enter a synchronized session lobby with both partners present, "Ready" up, and transition to an active deck (cards display, no swipes yet — that's P7).

### Tasks

#### Server
- [ ] SQL `build_deck(pod_id uuid, size int)` — pure SQL per DESIGN §5.3 using CTEs and `setseed`.
- [ ] RPC `start_session(pod_id uuid)`:
  - [ ] Verifies pod has 2 members.
  - [ ] Builds deck, inserts `sessions` row with status='lobby'.
  - [ ] Broadcasts `session.invited` on `pod:{pod_id}` channel.
  - [ ] Returns session_id + deck_recipe_ids.
- [ ] RPC `set_session_ready(session_id uuid)`:
  - [ ] Records caller's ready state in a session-readiness row (or in-memory via Realtime presence).
  - [ ] If both ready, flips session to 'active' and broadcasts `session.status`.
- [ ] RPC `end_session(session_id uuid, reason)`:
  - [ ] Idempotent; sets `ended_at`, `ended_reason`.
  - [ ] Broadcasts `session.status` with status='ended'.

#### Client
- [ ] `(app)/home.tsx` — "Start a session" CTA visible when pod has 2 members.
- [ ] `(app)/session/[sessionId].tsx`:
  - [ ] Subscribes to `session:{sessionId}` channel.
  - [ ] Lobby UI: both partner avatars + ready toggles + 10s auto-start countdown when both present.
  - [ ] On status='active' → render deck (cards visible, swipe wiring in P7).
- [ ] Realtime presence wiring: publish self ready state; render partner state.
- [ ] Push notification on `session.invited` (basic — full pipeline in P11; for now in-app banner).

### Tests required
- [ ] **pgTAP:** `start_session` against a 1-member pod fails.
- [ ] **pgTAP:** `build_deck` excludes hard-exclusion-flagged recipes for either partner.
- [ ] **pgTAP:** `build_deck` excludes already-matched recipes for the pod.
- [ ] **pgTAP:** `build_deck` excludes left-swiped-within-30-days recipes.
- [ ] **pgTAP:** `build_deck` is deterministic given fixed session_id seed.
- [ ] **Integration:** two clients see identical deck order.
- [ ] **Component:** lobby renders ready/not-ready states correctly.

### Exit criteria
- Alice taps "Start a session" → Bob sees lobby invite in <2s.
- Both ready → both transition to active deck view simultaneously.
- Deck of 20 cards visible; identical order on both phones.

---

## 10. Phase 7 — Swipe RPC + Match Detection (the Hot Path)

**Effort:** L
**Goal:** Both users can swipe through the deck; matches are detected exactly-once; `match.detected` broadcast fires synchronously on both phones.

### Tasks

#### Server
- [ ] RPC `submit_swipe(session_id, recipe_id, direction)` per DESIGN §7.1 — full implementation with `FOR UPDATE` session lock, partner-history check, match insert with `on conflict do nothing`.
- [ ] Postgres trigger on `matches AFTER INSERT` → `pg_notify('match_created', payload)` (used by P11 for push fan-out, but wire here so it's not forgotten).
- [ ] RLS policy review for `swipes` and `matches` — re-verify pgTAP coverage now that the RPC is in.

#### Client
- [ ] Swipe deck component using `react-native-reanimated` + `gesture-handler`:
  - [ ] Top card draggable, 60fps; angle + opacity tied to translateX.
  - [ ] Card-edge color flash on commit (green right / muted-red left) per MATCH-UX §8.1.
  - [ ] Light haptic on right commit; selection haptic on left.
  - [ ] Like / Dislike buttons present for a11y (NFR-A4).
- [ ] On swipe commit:
  - [ ] Optimistic local update to deck index.
  - [ ] RPC `submit_swipe`.
  - [ ] Broadcast `swipe.progress` on session channel (no direction).
  - [ ] If `match: true` returned → fire local `match.detected` event handler (overlay comes in P8 — for now log to console + render a basic alert).
- [ ] Partner-progress indicator (dot row per MATCH-UX §8.2).
- [ ] Swipe retry queue in MMKV per NFR-R1.

### Tests required
- [ ] **pgTAP race test:** insert two swipes for same recipe in same session via two simulated JWTs in rapid succession → exactly one row in `matches`.
- [ ] **pgTAP:** simultaneous right-swipes by both users on the same card (interleaved transactions) → one match.
- [ ] **pgTAP:** match across different sessions counts (partner right-swiped a year ago + caller now → match).
- [ ] **Unit:** swipe gesture mapping (translateX threshold → direction enum).
- [ ] **Component:** deck advances on swipe commit; ends with no-more-cards state.
- [ ] **Integration:** swipe sent on flaky network gets retried from MMKV queue.

### Exit criteria
- Both users can swipe through a full 20-card deck.
- A simultaneous right-swipe by both phones produces exactly one match row server-side (verified via direct DB query) and one log line on each client.
- pgTAP race tests pass deterministically across 100 runs.

---

## 11. Phase 8 — Match Overlay UX

**Effort:** L
**Goal:** The MATCH-UX spec is implemented end-to-end. Two partners swiping right on the same card see synchronized celebratory overlays within budget.

### Tasks
- [ ] `MatchOverlay` component per MATCH-UX §15:
  - [ ] Subscribes to `match.detected` from session channel.
  - [ ] Renders frame-by-frame timeline from MATCH-UX §3 (t=0 → t=1200ms).
  - [ ] Backdrop dim, card scale, card flip, confetti emitter, partner avatars, recipe hero, CTAs.
- [ ] Confetti via `react-native-skia` (preferred) per MATCH-UX §4.3.
- [ ] Haptic sequence wired via `expo-haptics` per MATCH-UX §5.
- [ ] Audio (opt-in) via `expo-audio` per MATCH-UX §6 — placeholder sounds OK for v1, final pass with sound designer pre-launch (MATCH-UX §17).
- [ ] **Variable-reward resolver** per MATCH-UX §7: pure function `(session_match_index, pod_lifetime_matches, swipe_time_delta_ms, deck_position, deck_size) → variant`.
- [ ] **Settings → Vibes** screen with haptics / sounds / animations / lite-mode toggles, MMKV-backed.
- [ ] `prefers-reduced-motion` detection → swap motion path to crossfade per MATCH-UX §10.
- [ ] Performance budget: dev-build FPS overlay; Sentry perf marker for "match-reveal-first-frame".
- [ ] PostHog events `match_revealed`, `match_overlay_dismissed`, `match_first_ever`, `settings_vibes_changed`.

### Tests required
- [ ] **Unit:** variant resolver — exhaustive truth table from MATCH-UX §7.
- [ ] **Unit:** haptic invocation count per variant.
- [ ] **Component:** overlay renders all variants; reduce-motion path skips springs.
- [ ] **Component:** settings toggles disable haptics/sounds/animations.
- [ ] **Integration:** two simulators receive `match.detected` → both render overlay within 100ms of each other (verified via timestamped logs).
- [ ] **a11y:** VoiceOver reads overlay; TalkBack reads overlay; reduce-motion path verified.
- [ ] **Perf:** confetti scene sustains ≥58fps p95 on iPhone 12 (manual + Sentry).

### Exit criteria
- Two devices in the same session swiping right on the same card see the full 2.0s celebration with confetti, partner avatars, and a heavy haptic — within 100ms of each other.
- All five variants from §7 verified manually with seeded scenarios.
- Settings toggles work; reduce-motion path verified on both OSes.
- PostHog dashboard shows `match_revealed` with variant property.

---

## 12. Phase 9 — Cookbook + Ratings + Notes

**Effort:** M
**Goal:** Matches become first-class entries in a shared cookbook with per-user ratings and a shared notes field.

### Tasks
- [ ] `(app)/cookbook/index.tsx` — grid/list of pod's matches; sortable; searchable.
- [ ] `(app)/cookbook/[matchId].tsx` — recipe detail:
  - [ ] Full ingredient list with "Add to shopping list" toggle per item (wires to P10's RPC).
  - [ ] Instructions rendered from `raw_payload.analyzedInstructions` or `instructions`.
  - [ ] "Mark as cooked" toggle (writes `matches.cooked_at`).
  - [ ] Per-user star rating (1–5).
  - [ ] Shared notes field (last-write-wins debounce 2s).
  - [ ] Source attribution (Spoonacular ToS compliance).
- [ ] "Remove from cookbook" with soft-delete behavior per FR-C4.
- [ ] Subscribe to `pod:{pod_id}` Postgres Changes on `matches`, `recipe_ratings`, `recipe_notes` for realtime UI updates.

### Tests required
- [ ] **Component:** cookbook grid renders; empty state renders.
- [ ] **Component:** cooked-toggle updates DB and reflects on partner client (Realtime mock).
- [ ] **Component:** notes debounce: rapid edits coalesce into one DB write.
- [ ] **Component:** rating is per-user (caller's 4-star doesn't overwrite partner's 3-star).
- [ ] **Integration:** remove → 30-day archive → can re-appear in next deck (verified via SQL).
- [ ] **pgTAP:** `recipe_notes` FK to `matches(pod_id, recipe_id)` rejects orphan notes.

### Exit criteria
- Match → tap → cookbook entry visible; both partners can edit notes, see both ratings.
- Removed recipe reappears in a deck generated 31 days later (or after clearing the right-swipe history via the remove action per FR-C4).

---

## 13. Phase 10 — Shopping List + Pantry

**Effort:** M
**Goal:** Both partners can add/check/clear shopping list items and pantry items; everything syncs in real time; pantry-aware "you already have this" prompt works.

### Tasks
- [ ] `(app)/shopping.tsx` — list grouped by `category`; check / uncheck / "Clear checked" action.
- [ ] `(app)/pantry.tsx` — list with name / qty / unit / expiration; manual add; edit.
- [ ] Add-from-recipe flow in cookbook detail (P9 wired through to here).
- [ ] RPC `add_shopping_items_from_recipe(pod_id, recipe_id, ingredient_ids[])` returns `pantry_conflicts` per DESIGN §11.3.
- [ ] Pantry-conflict toast: "You have olive oil on hand — add anyway?" with cancel/confirm.
- [ ] "Move to pantry" action on checked shopping items.
- [ ] Subscribe to `pod:{pod_id}` Postgres Changes on `shopping_list_items` and `pantry_items`.
- [ ] Manual add flow (free-text name + optional category) for shopping and pantry.

### Tests required
- [ ] **Component:** add / check / clear / move-to-pantry flows.
- [ ] **Component:** pantry-conflict toast renders when adding a matching ingredient.
- [ ] **Integration:** two clients see additions on each other within 1s.
- [ ] **pgTAP:** unique index `(pod_id, name_clean)` rejects duplicate pantry entries.
- [ ] **Unit:** `nameClean()` normalizer (lowercase + singularize) produces correct keys for "Olive Oil", "olive oil", "Olive Oils".

### Exit criteria
- Partner A adds 5 ingredients from a matched recipe → Partner B's shopping list updates within 1s.
- Adding an already-in-pantry ingredient surfaces the conflict prompt.
- Checked items move to pantry on action; pantry deduplicates by `name_clean`.

---

## 14. Phase 11 — Push Notifications

**Effort:** M
**Goal:** Push permission is requested at the right moment (after first pod), and three notification types deliver reliably.

### Tasks
- [ ] In-app priming sheet per DESIGN §16.2 — triggers when `pod_members.joined_at` is set for caller.
- [ ] On permission grant → register Expo push token → upsert `push_tokens`.
- [ ] Edge Function `fan-out-push`:
  - [ ] Subscribed to Postgres webhook on `matches AFTER INSERT` and `pod_invites WHERE consumed_at IS NOT NULL` and a generic `session.invited` event.
  - [ ] Sends payload per DESIGN §9.3 to https://exp.host/--/api/v2/push/send.
  - [ ] Respects per-type opt-outs from Settings → Notifications.
- [ ] Daily Postgres cron to prune `push_tokens.last_seen < now() - 30 days`.
- [ ] Deep-link handler for tapping a push (match → cookbook entry, session-invited → session lobby, pod-joined → home).

### Tests required
- [ ] **Component:** priming sheet appears after first `pod.member.joined`.
- [ ] **Component:** denying permission marks MMKV `prompted_at`; re-prompt suppressed for 14d.
- [ ] **Integration:** Edge Function dispatches push when a `matches` row is inserted (Expo Push receipt fetched).
- [ ] **Integration:** notification-type opt-out actually filters delivery in Edge Function.
- [ ] **Manual (device):** tapping a match push deep-links to the correct cookbook entry.

### Exit criteria
- Permission prompt fires after first pod creation (not before).
- Real iOS + Android devices receive `match.detected` push when backgrounded.
- Pruning cron runs daily, removes stale tokens.

---

## 15. Phase 12 — Analytics (PostHog)

**Effort:** S
**Goal:** Full event taxonomy from DESIGN §17.1 is captured; group analytics on `pod` works.

### Tasks
- [ ] `posthog-react-native` initialized at app bootstrap with Clerk distinct_id.
- [ ] `posthog-node` in `fan-out-push` and other Edge Functions for server-side events.
- [ ] `posthog.identify(user_id, props)` on sign-in and on pod join/leave.
- [ ] `posthog.group('pod', podId, props)` on pod load.
- [ ] Wrap PostHog calls in a thin `src/lib/analytics.ts` so events are unit-testable and we can add transformations later.
- [ ] Pre-allocate feature flags in PostHog console: `confetti_engine`, `match_overlay_v2`, `deck_size`, `lite_mode_threshold`.
- [ ] Wire `deck_size` flag into `start_session` RPC call (client passes the flag value).

### Tests required
- [ ] **Unit:** analytics wrapper drops events on consent opt-out (no PII leaves device).
- [ ] **Unit:** `swipe` events do not include user names or any field beyond DESIGN §17.1.
- [ ] **Integration:** PostHog client receives a known event during a Jest-rendered swipe test.

### Exit criteria
- PostHog dashboard shows live events from a TestFlight build.
- `Group analytics on pod` produces a non-empty "matches per pod" chart after a smoke test.

---

## 16. Phase 13 — Polish + a11y + Perf + E2E + Store Submission

**Effort:** L
**Goal:** Public-ready build on both stores. Every NFR is verified, not just claimed.

### Tasks

#### Accessibility audit
- [ ] Every interactive element has `accessibilityLabel`.
- [ ] Dynamic Type / font scaling tested up to 200%.
- [ ] Color contrast WCAG AA verified (use Stark or similar).
- [ ] Swipe-deck button fallback (NFR-A4) tested with VoiceOver/TalkBack.
- [ ] Reduce-motion path verified across every animation surface.

#### Performance verification
- [ ] Cold start to home < 2.5s on iPhone 12 + Pixel 6 (NFR-P3).
- [ ] Swipe gesture ≥58fps p95 (NFR-P1).
- [ ] Match overlay first frame ≤100ms post-broadcast (MATCH-UX §11).
- [ ] Match end-to-end latency p95 < 800ms broadband / < 2s 4G (NFR-P2) — measured via dev-mode logging with NTP-aligned clocks.
- [ ] Bundle size below CI cap.

#### E2E (Maestro)
- [ ] Critical-flow Maestro YAMLs:
  - [ ] Sign-in + onboarding + dietary chips.
  - [ ] Invite → consume (two simulators).
  - [ ] Full session → match → cookbook → shopping add.
  - [ ] Dissolve pod → partner-removed-me screen.
- [ ] CI integration on PR (subset) and nightly (full).

#### Reliability
- [ ] Realtime reconnect under simulated network loss (NFR-R3).
- [ ] Swipe retry queue exercised under offline → online transition.
- [ ] Match exactly-once verified under simulated concurrent right-swipes (already in P7 pgTAP, but re-verify end-to-end here).

#### Store prep
- [ ] App icons + splash screens (final brand assets).
- [ ] App Store / Play Store listings with screenshots, descriptions, privacy disclosures (PostHog + Sentry data flow), age rating.
- [ ] Account deletion endpoint surfaced in Settings (FR-A3) — App Store requirement.
- [ ] Production EAS build profiles green.
- [ ] Submit to TestFlight + Internal Testing track.
- [ ] Final pgTAP / Jest coverage report ≥ 90%.

### Tests required
This phase is *largely* about verifying tests written earlier still pass at scale. New tests added here:
- [ ] E2E happy paths via Maestro.
- [ ] Snapshot tests for App Store screenshots (catches accidental visual regressions before store rejection).

### Exit criteria
- App in TestFlight + Play Internal Testing.
- All NFRs verified with logged measurements.
- Coverage gate green at ≥ 90%.
- Account deletion works end-to-end.

---

## 17. Parallelization Cheat-Sheet

After P0–P2 complete, the following pairs can be developed in parallel by a solo dev splitting context across days, or by separate contributors:

- **P3 (ingestion) ∥ P4 (app shell)** — different parts of the stack.
- **P9 (cookbook) ∥ P10 (shopping/pantry)** — both depend on P5+P7 but not each other.
- **P11 (push) ∥ P12 (analytics)** — different external services.

Hot path is strictly sequential: P5 → P6 → P7 → P8.

---

## 18. Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Spoonacular free-tier rate-limit changes mid-development | M | M | Cache aggressively; budget for paid tier. Catalog already retained in `RecipeJson/` as fallback. | dev |
| Supabase Realtime latency exceeds NFR-P2 in real network conditions | L | H | P7/P8 measures latency end-to-end; fallback plan: layer optional WebSocket microservice for swipes only. Document in DESIGN §6 if triggered. | dev |
| Clerk JWT template breaks on Clerk version upgrade | L | M | Pin Clerk SDK minor version; integration test that mints + verifies JWT runs in CI. | dev |
| Confetti perf bombs on older Android | M | M | Skia fallback to Lottie; "lite mode" automatically enabled by device-class heuristic (MATCH-UX §11). | dev |
| Spoonacular ToS reinterpretation forces link-out | L | H | Already confirmed; if changes, can pivot recipe detail to deep-link to `source_url` without schema change. | product |
| App Store rejection on "another swipe app" classification | L | M | Lean hard on "couples utility" positioning; emphasize cookbook + shopping list in screenshots. | product |
| RLS bug leaks dietary profile between partners | L | H | pgTAP test `dietary_profiles_strict_self.sql` is the canary; runs every CI. Manual penetration test in P13. | dev |
| 90% coverage gate slows down delivery | M | L | Per-package thresholds (not flat 90%); some packages naturally higher (pure logic) compensating for thinner UI tests. | dev |

---

## 19. Definition of Done (project-wide)

A feature is done when:
1. Tests written first; tests pass.
2. Coverage ≥ 90% lines on the touched files.
3. RLS policies reviewed if schema changed; pgTAP added.
4. PostHog event taxonomy updated if a new tracked behavior was added.
5. Accessibility labels in place.
6. CHANGELOG entry (single line).
7. PR description references the phase + the spec section it implements.
8. Green CI; manual smoke on at least one physical device per OS.

---

## 20. What's NOT in this workflow

- Visual brand design / logo / color tokens — that's a separate design system pass before P13 polish.
- Sound design (final assets for match audio) — bundled into P8 with placeholders, finalized before P13.
- Marketing site / landing page — out of scope; the well-known config served at `cookdaddy.app/.well-known/` is just infrastructure.
- Customer support tooling — defer until first 1k users.
- Analytics dashboards beyond default PostHog views — bespoke dashboards after MVP launch.

---

## 21. Next Action

Run `/sc:implement` against **Phase 0** to bootstrap the repo. The workflow doc above is the source of truth for what each phase needs to deliver — no need to re-derive.
