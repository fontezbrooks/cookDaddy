# cookDaddy — Product Requirements Document

**Status:** Draft v1
**Owner:** Fontez Brooks
**Last updated:** 2026-05-21
**Source:** `docs/initial_brainstorm.md` + brainstorm session 2026-05-21

---

## 1. Summary

cookDaddy is a mobile app for couples that replaces the daily "what do you want to eat?" negotiation with a fun, low-friction shared decision. Each partner swipes Tinder-style through a deck of recipes in a live, synchronized session. When both right-swipe the same recipe, it's a **match** — it's saved to their shared cookbook, ingredients can be added to a shared shopping list (with pantry-aware deduction), and the couple has a concrete plan for dinner.

**Tagline (working):** *"Stop asking. Start cooking."*

---

## 2. Goals & Non-Goals

### 2.1 Goals (v1)
- G1. Reduce time-to-decision on "what's for dinner" for paired couples.
- G2. Make recipe discovery feel collaborative and playful, not transactional.
- G3. Convert matched recipes into actionable grocery + cooking outcomes.
- G4. Ship a polished mobile experience on iOS and Android from one Expo codebase.
- G5. Enforce TDD with **90% code coverage** as a quality bar (per user directive in brainstorm).

### 2.2 Non-Goals (v1)
- NG1. Group cooking pods (3+ people) — strict 1:1 partner pairs only.
- NG2. Async swiping — sessions are live-sync only; no "swipe whenever, match later".
- NG3. In-app meal planning calendar / scheduling — defer to v2.
- NG4. Social/discovery features (follow friends, public cookbooks) — defer.
- NG5. Web client — mobile-first; Expo Web deferred.
- NG6. Custom recipe authoring by users — defer; v1 catalog is curated/seeded.

---

## 3. Target User & Use Cases

### 3.1 Primary Persona — "Co-living couple"
- Two adults sharing meals, often with mismatched work schedules.
- Both own smartphones (iOS or Android).
- At least one cooks regularly; both have opinions on food.
- May have dietary restrictions, allergies, or strong preferences.

### 3.2 Core User Stories

**US-1 — First-time pairing**
> As a new user, I sign up, invite my partner via a share link, and once they accept we're a pod so we can start swiping together.

**US-2 — Daily dinner decision**
> As one half of a pod, I open the app, start a session, my partner gets a push to join live, and within ~2 minutes of swiping we've matched on tonight's dinner.

**US-3 — Match → groceries**
> Once we match on a recipe, I tap the ingredients I don't already have on hand, and they appear on our shared shopping list before I go to the store.

**US-4 — Dietary safety**
> As a user with a peanut allergy, I set my filter once; I never see peanut-containing recipes, even though my partner has no such restriction.

**US-5 — Cook & remember**
> After we cook a match, I mark it "cooked", give it 4 stars, and note "use less garlic." Next time it appears in our cookbook, the note is there.

**US-6 — Pantry awareness**
> I track that I have olive oil and rice on hand. When I add ingredients to the shopping list from a matched recipe, those ingredients are auto-excluded.

---

## 4. Functional Requirements

### 4.1 Authentication & Account (FR-A)
- **FR-A1.** Users sign up / log in via Clerk (existing Pro account). Email + OAuth providers (Apple, Google) at minimum.
- **FR-A2.** First-run onboarding: name, profile photo (optional), dietary restrictions (skippable), invite partner OR accept pending invite.
- **FR-A3.** Account deletion endpoint (App Store / Play Store compliance): removes user, dissolves pod, soft-deletes shared artifacts (cookbook entries authored by the user retain attribution to the pod, but the user's PII is purged).

### 4.2 Pods (FR-P)
- **FR-P1.** A **pod** is exactly 2 users. No solo pods. No 3+ pods.
- **FR-P2.** A user belongs to **at most one active pod** at a time.
- **FR-P3.** Invite flow: inviter taps "Invite partner" → app generates a one-time, expiring (24h) **share link** with deep-link / Universal Link / App Link support. Recipient taps link → app opens (or App Store if not installed) → accept screen → pod created.
- **FR-P4.** Either partner may dissolve the pod. Dissolution requires confirmation. On dissolution:
  - Pod becomes archived (read-only) for 30 days, then hard-deleted.
  - Shared cookbook becomes read-only for both; each user can optionally copy entries to a personal cookbook (post-MVP feature flagged).
  - Shopping list and pantry items archive with the pod.
  - **Re-pairing does not restore the old pod.** A new pod is created from scratch — fresh cookbook, shopping list, pantry. (Decided 2026-05-21.)
- **FR-P5.** A user whose pod was dissolved can immediately create or accept a new pod invite.
- **FR-P6 — Partner-removed-me UX.** When a user's pod is dissolved by their partner (not by themselves), on next app foreground they see a dedicated screen:
  - Copy: "Your pod with {partner name} has ended."
  - Primary CTA: "Invite someone new" → generates a fresh pod + invite link.
  - Secondary CTA: "Maybe later" → returns to a pre-pod home state.
  - No blaming language. No retry-the-same-partner CTA (they can re-invite by sharing a new link if they choose).
  - Push notification at dissolution time is suppressed; the in-app reveal is gentler than a push.

### 4.3 Sessions & Swiping (FR-S)
- **FR-S1.** Sessions are **live-sync only**. Partner A starts session → Partner B receives push + in-app prompt → both must be present for session to be active.
- **FR-S2.** Session lobby shows both partners' presence (avatar + "ready" state). Session starts when both tap "Ready" or after 10s grace once both are present.
- **FR-S3.** Each session generates a **deck** of N recipes (default: 20, configurable in app constants). Deck composition:
  - Filtered by the **intersection** of dietary safety rules from both users (allergies / restrictions are hard exclusions).
  - Excludes any recipe both users have ever right-swiped (already matched).
  - Excludes any recipe either user has left-swiped within the **last 30 days** (cooldown).
  - Deck is shuffled deterministically per-session (seeded by session ID) so both partners see cards in the same order.
- **FR-S4.** Swipe gestures: right = like, left = dislike. Tap card → recipe detail modal (does not record a swipe). Swiping commits the choice.
- **FR-S5.** Swipes from each partner are streamed to the other's client; partner-progress is visible (e.g., "Alex has swiped on 7/20") without leaking which way they swiped.
- **FR-S6.** **Match detection:** when both users have right-swiped the same recipe (regardless of order), a celebratory **instant match overlay** appears on both phones with the recipe card, "Cook this!" CTA, and "Keep swiping" option. The overlay is a first-class UX surface — full motion, haptic, audio (opt-in), and variable-reward design lives in [`docs/MATCH-UX/README.md`](../MATCH-UX/README.md).
- **FR-S7.** Session end conditions:
  - Both partners reach end of deck → "Session complete" summary screen.
  - Either taps "End session" → confirmation → session ends for both.
  - Either partner disconnects > 60s → session pauses; on reconnect within 5 min, resumes from current card; otherwise session ends.
- **FR-S8.** Session resume after disconnect is best-effort, not a hard requirement (acceptable to require restart in v1 if reconnect logic adds significant complexity).

### 4.4 Filters & Dietary Rules (FR-F)
- **FR-F1.** Each user has a **private** dietary profile:
  - **Hard exclusions** (allergies, religious, ethical): vegan, vegetarian, gluten-free, dairy-free, nut-free, shellfish-free, pork-free, etc. Anything checked here is *never* shown in the user's deck, even if the partner has no such restriction.
  - **Soft preferences** (lowers ranking but doesn't exclude): low-carb, low-sodium, high-protein, etc.
- **FR-F2.** Hard exclusions are enforced as the **union** across both partners (the strictest pair wins).
- **FR-F3.** Users can update their dietary profile any time; changes apply to the next session, not the current one.
- **FR-F4.** Filters are not visible to the partner. (Privacy: someone's allergies / restrictions are theirs to share.)

### 4.5 Cookbook (FR-C)
- **FR-C1.** Matched recipes auto-save to the pod's shared cookbook.
- **FR-C2.** Cookbook view: list / grid of matched recipes, sortable by match-date / cooked / rating / alphabetical. Searchable by title.
- **FR-C3.** Recipe detail view (in cookbook): full recipe (title, image, ingredients, instructions, time, servings, source attribution per Spoonacular ToS), "Add ingredients to shopping list" CTA, "Mark as cooked" toggle, rating (1–5 stars, per-user, both visible), notes (shared text field, both can edit, last-edited timestamp shown).
- **FR-C4.** Either partner can remove a recipe from the cookbook. Removal is soft — moves to a "recently removed" bin for 30 days, then hard-deletes. Removing also clears it from the right-swipe history so it can re-enter future decks.

### 4.6 Shopping List (FR-SL)
- **FR-SL1.** One **shared, persistent** shopping list per pod.
- **FR-SL2.** From a recipe detail, user taps each ingredient → toggles "add to shopping list". Items can also be added manually (free-text + optional category).
- **FR-SL3.** Items have: name, quantity (optional), unit (optional), source recipe (optional FK), category (auto from Spoonacular `aisle` field when available), checked/unchecked state, added-by user.
- **FR-SL4.** Pantry-aware add: when adding an ingredient, if it already exists in the pantry with sufficient quantity, surface a toast "You have this on hand — add anyway?" with confirm/cancel.
- **FR-SL5.** Realtime sync: edits by either partner appear on the other's device within ~1s.
- **FR-SL6.** Checking an item off does not delete it; "Clear checked" action removes all checked items at once.

### 4.7 Pantry (FR-PN)
- **FR-PN1.** One **shared pantry inventory** per pod.
- **FR-PN2.** Pantry items: name, quantity (optional), unit (optional), expiration date (optional), added-by user, updated-at.
- **FR-PN3.** Quick-add flows:
  - Manual entry.
  - From a checked shopping list item → "Move to pantry" action.
- **FR-PN4.** Pantry affects: shopping-list pantry-aware prompts (FR-SL4) and (post-MVP) recipe ranking ("you have most ingredients for this one").
- **FR-PN5.** Realtime sync between partners.

### 4.8 Notifications (FR-N)
- **FR-N1.** Push notifications via Expo Push (APNs / FCM under the hood). Permission requested contextually after first pod is created, not at app launch.
- **FR-N2.** Notification triggers (v1):
  - Partner invited you to a session ("Alex wants to swipe!")
  - New match while you're not in the foreground.
  - Partner accepted your pod invite.
- **FR-N3.** Per-notification-type toggles in Settings.

### 4.9 Recipe Catalog & Ingestion (FR-R)
- **FR-R1.** Source: Spoonacular `getRandomRecipes` endpoint, ingested via existing hourly cron (`setup-spoon-cron.sh` → `test-spoon.ps1`).
- **FR-R2.** A new ingestion step writes the raw JSON to `RecipeJson/` **and** upserts normalized rows into Supabase (idempotent on `recipes.external_id` = Spoonacular recipe ID).
- **FR-R3.** Catalog displays Spoonacular attribution per their ToS (source name, credits text, license, source URL — all present in payload).
- **FR-R4.** Catalog floor before launch: ≥ 500 unique recipes seeded (a ~3-week ingestion run at hourly cadence yields ~500+ on the free tier; verify dedup rate first).
- **FR-R5.** Recipes with insufficient data (missing ingredients, missing instructions, missing image) are flagged and excluded from decks.

### 4.10 Onboarding (FR-O)
- **FR-O1.** First-launch flow: welcome → sign in (Clerk) → name + photo → dietary restrictions (3-tap chip selector, skippable) → "Invite partner" OR "I have an invite link" → pod ready.
- **FR-O2.** Empty states: pre-pod home shows a single "Invite your partner" hero CTA. Post-pod, pre-first-session shows "Start swiping" CTA.

---

## 5. Non-Functional Requirements

### 5.1 Performance (NFR-P)
- **NFR-P1.** Swipe gesture-to-visual response: < 16ms (60fps) on mid-tier devices (iPhone 12, Pixel 6).
- **NFR-P2.** Match-event end-to-end latency (swipe commit → partner sees match overlay): **p95 < 800ms** on broadband, **p95 < 2s** on 4G.
- **NFR-P3.** Cold start to home screen: < 2.5s on mid-tier devices.
- **NFR-P4.** Deck pre-fetched in full at session start; no per-card network calls during swipe.

### 5.2 Reliability (NFR-R)
- **NFR-R1.** Swipes are durable: a swipe committed locally must reach the server within 5s or be queued for retry; never silently lost.
- **NFR-R2.** Match detection is exactly-once per recipe per pod (duplicate match events deduped server-side).
- **NFR-R3.** Realtime channel disconnects auto-reconnect with exponential backoff (max 30s).

### 5.3 Security & Privacy (NFR-S)
- **NFR-S1.** Auth via Clerk; session JWT validated server-side on every request.
- **NFR-S2.** Row-level security (RLS) in Supabase: a user can only read/write pod data for their own pod.
- **NFR-S3.** Dietary profile is private; never exposed to the partner via API responses.
- **NFR-S4.** Invite share-links are single-use, expire in 24h, signed (HMAC), and revoke-able by the inviter.
- **NFR-S5.** No PII in client logs; structured server logs without raw email / name.
- **NFR-S6.** Spoonacular API key never shipped to the client; ingestion runs server-side only.

### 5.4 Quality / Test (NFR-Q)
- **NFR-Q1.** **TDD enforced.** Tests written before implementation for every feature module.
- **NFR-Q2.** **90% line coverage** minimum across the codebase (per brainstorm directive). CI blocks merges below threshold.
- **NFR-Q3.** Test pyramid: unit tests (Jest) for logic, integration tests for DB/RLS (against local Supabase), and a thin E2E layer (Detox or Maestro) for critical flows: sign-in, pairing, full session, match.
- **NFR-Q4.** Realtime / match-detection logic has explicit race-condition tests (both swipe simultaneously, network reorderings).

### 5.5 Accessibility (NFR-A)
- **NFR-A1.** All interactive elements have accessibility labels.
- **NFR-A2.** Dynamic Type (iOS) and font scaling (Android) supported up to 200%.
- **NFR-A3.** Color contrast meets WCAG 2.1 AA on all surfaces.
- **NFR-A4.** Swipe deck has button-based fallback (Like / Dislike buttons) for users who cannot perform swipe gestures.

### 5.6 Observability (NFR-O)
- **NFR-O1.** Client error reporting (Sentry).
- **NFR-O2.** Product analytics via **PostHog** (decided 2026-05-21). Events: session_started, session_ended, swipe (anonymized direction-only), match_revealed (+variant per MATCH-UX §13), match_overlay_dismissed, recipe_cooked, shopping_list_item_added, settings_vibes_changed, push_permission_granted.
- **NFR-O3.** Server-side request/error logs with correlation IDs across realtime + REST.

---

## 6. Recommended Technical Stack

> User explicitly asked for a recommendation on stack — especially the realtime layer. This section is **opinionated recommendation, not final design.** A `/sc:design` pass should validate and detail.

### 6.1 Mobile Client
- **Expo SDK 53+** (latest stable), managed workflow with EAS Build.
- **expo-router** for file-based routing (per brainstorm).
- **TypeScript**, strict mode.
- **react-native-reanimated 3+** + **react-native-gesture-handler** for swipe gestures (60fps off main thread).
- **Zustand** for client state (lightweight, no boilerplate). Local persistence via `expo-secure-store` for tokens, `expo-sqlite` or `mmkv` for offline cache.
- **expo-notifications** for push.
- **expo-linking** + Universal Links (iOS) / App Links (Android) for invite deep linking.
- **TanStack Query** for REST cache + invalidation.

### 6.2 Auth
- **Clerk** (existing Pro account). `@clerk/clerk-expo`. Clerk session JWT passed to Supabase via JWT template → Supabase RLS keyed off `auth.uid()` mapped from Clerk user ID.

### 6.3 Database & API
- **Supabase (Postgres + Auth-via-JWT + Realtime + Storage)**, local instance already running per brainstorm (`EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`).
- Postgres for relational data; RLS policies for pod-scoped access.
- Storage for any user-uploaded images (profile photos, future recipe photos).

### 6.4 Realtime — Recommendation: **Supabase Realtime**

**Considered:**

| Option | Pros | Cons |
|---|---|---|
| **Supabase Realtime** ✅ | Already in stack; Presence + Broadcast + Postgres Changes in one channel; no extra infra; first-party RLS integration; free with Supabase. | Less battle-tested than dedicated WS for very high concurrency; Broadcast is at-most-once (need durable writes for swipes — fine, we write to DB anyway). |
| **Custom WebSocket (Node/Bun + ws)** | Maximum control; tunable. | Ops burden, scaling, auth bridging, monitoring — all you. Wrong leverage for a 2-person session product. |
| **Liveblocks / PartyKit** | Best-in-class collab primitives (CRDTs, presence). | Extra vendor, extra cost, overkill for our event volume; data lives outside Supabase so RLS becomes harder. |
| **Pusher / Ably** | Mature, simple. | Extra vendor + cost; another auth bridge. |

**Verdict:** **Supabase Realtime** wins on first-principles: our session is two clients exchanging ≤ 100 events/min with a durable Postgres write being the source of truth. Realtime's **Broadcast** channel handles low-latency swipe events; **Postgres Changes** drives shopping-list/pantry sync; **Presence** drives the session lobby. No extra infra, no extra vendor, RLS-aligned. Re-evaluate only if we measure p95 latency missing NFR-P2.

### 6.5 Recipe Ingestion
- Existing hourly Spoonacular cron retained. New step (Node script or Supabase Edge Function on schedule) reads new JSON files from `RecipeJson/`, normalizes, and upserts into `recipes` + `recipe_ingredients` tables. Idempotent on `external_id`.
- Long-term: replace file-system intermediate with direct API → DB write in a single scheduled job.

### 6.6 Testing
- **Jest** + **@testing-library/react-native** for unit/component.
- **Supabase local + pgTAP** for RLS / SQL policy tests.
- **Detox** (preferred) or **Maestro** for E2E.
- **MSW** for REST mocking; mock Realtime channel in unit tests.
- Coverage enforced via Jest `--coverageThreshold` 90%.

### 6.7 CI/CD
- GitHub Actions: lint → typecheck → unit → integration → coverage gate → EAS preview build.
- EAS Submit for App Store / Play Store.

---

## 7. Data Model Sketch

Initial entity outline (detailed schema in `/sc:design` pass). Field types abbreviated.

- **users** (mirrors Clerk users for FK joins): `id (pk, = clerk_user_id)`, `display_name`, `avatar_url`, `created_at`, `dietary_profile_id (fk)`.
- **dietary_profiles**: `id (pk)`, `user_id (fk, unique)`, `hard_exclusions (jsonb of enum)`, `soft_preferences (jsonb)`, `updated_at`.
- **pods**: `id (pk)`, `created_at`, `archived_at (nullable)`.
- **pod_members**: `pod_id (fk)`, `user_id (fk)`, `joined_at`, **unique(user_id) where archived_at is null** (enforce one active pod per user).
- **pod_invites**: `id (pk)`, `pod_id (fk)`, `inviter_user_id (fk)`, `token (hmac-signed)`, `expires_at`, `consumed_at (nullable)`.
- **recipes**: `id (pk)`, `external_id (unique, spoonacular id)`, `title`, `image_url`, `source_url`, `source_name`, `credits_text`, `license`, `ready_in_minutes`, `servings`, `health_score`, `dietary_flags (jsonb)`, `created_at`, `raw_payload (jsonb)`.
- **recipe_ingredients**: `id (pk)`, `recipe_id (fk)`, `external_ingredient_id`, `name`, `original_text`, `amount`, `unit`, `aisle`, `image_url`.
- **recipe_instructions**: `recipe_id (fk)`, `step_number`, `text`. *(or denormalized into recipes.raw_payload for v1.)*
- **sessions**: `id (pk)`, `pod_id (fk)`, `started_at`, `ended_at`, `deck_recipe_ids (int[])`, `ended_reason`.
- **swipes**: `id (pk)`, `session_id (fk)`, `user_id (fk)`, `recipe_id (fk)`, `direction (enum: right/left)`, `created_at`, **unique(session_id, user_id, recipe_id)**.
- **matches**: `id (pk)`, `pod_id (fk)`, `recipe_id (fk)`, `session_id (fk)`, `matched_at`, **unique(pod_id, recipe_id)**.
- **cookbook_entries** (= materialized matches with state): `pod_id (fk)`, `recipe_id (fk)`, `cooked_at (nullable)`, `removed_at (nullable)`. *(May collapse with matches table.)*
- **recipe_ratings**: `pod_id (fk)`, `recipe_id (fk)`, `user_id (fk)`, `stars (1-5)`, `updated_at`.
- **recipe_notes**: `pod_id (fk)`, `recipe_id (fk)`, `body (text)`, `last_edited_by (fk)`, `updated_at`.
- **shopping_list_items**: `id (pk)`, `pod_id (fk)`, `name`, `quantity`, `unit`, `category`, `source_recipe_id (fk, nullable)`, `added_by_user_id (fk)`, `checked_at (nullable)`, `created_at`.
- **pantry_items**: `id (pk)`, `pod_id (fk)`, `name`, `quantity`, `unit`, `expires_at (nullable)`, `updated_by_user_id (fk)`, `updated_at`.

**Indexes:** `swipes(session_id, user_id)`, `swipes(recipe_id, direction, user_id)` for cooldown lookups, `matches(pod_id)`, `shopping_list_items(pod_id, checked_at)`.

---

## 8. Acceptance Criteria (per major story)

### US-1 — Pairing
- [ ] User A taps "Invite partner" → share sheet opens with link.
- [ ] User B taps link on a device with the app → in-app accept screen → tap accept → both land on pod home within 3s.
- [ ] User B taps link without app installed → routed to App Store / Play Store; on first launch post-install, deep link is honored.
- [ ] Invite link expires after 24h; expired link shows clear error, offers "Ask for a new link."
- [ ] A user already in a pod attempting to accept a new invite gets a clear error.

### US-2 — Live session → match
- [ ] User A starts a session → User B receives push within 5s and an in-app banner if already in-app.
- [ ] Lobby shows both users' presence within 1s of join.
- [ ] Deck of 20 recipes loads pre-shuffled; both users see identical card order.
- [ ] Each swipe is committed locally within 16ms; partner sees progress within 800ms p95.
- [ ] A simultaneous right-swipe by both partners on the same card produces exactly one match event with overlay on both phones.
- [ ] Disconnecting and reconnecting within 60s does not lose any swipes.

### US-3 — Match → shopping
- [ ] From match overlay, "Cook this!" → recipe detail.
- [ ] Tapping an ingredient toggles it onto the shared shopping list within 1s on both devices.
- [ ] Adding an ingredient already in pantry triggers the "you have this — add anyway?" prompt.

### US-4 — Dietary safety
- [ ] User sets "nut-free" hard exclusion → in next session, zero recipes containing tree nuts or peanuts appear in the deck.
- [ ] Partner cannot see User's dietary settings via any API call (RLS verified).

### US-5 — Cook, rate, note
- [ ] "Mark as cooked" sets a timestamp visible to both partners.
- [ ] Each partner can independently set their own star rating; both ratings shown.
- [ ] Notes are a single shared field; concurrent edits use last-write-wins with a 2s debounce.

### US-6 — Pantry
- [ ] Adding an item to pantry persists across app restarts.
- [ ] Checking a shopping-list item shows a "Move to pantry?" action.

---

## 9. Open Questions

All PRD-level questions from v1 draft were resolved 2026-05-21. New questions are tracked in [`docs/DESIGN/README.md §15`](../DESIGN/README.md#15-open-questions-carried-from-prd) and [`docs/MATCH-UX/README.md §17`](../MATCH-UX/README.md#17-open-questions).

---

## 10. Decisions Log

### From brainstorm 2026-05-21 (initial PRD draft)

| Decision | Choice | Rationale |
|---|---|---|
| Session model | Live-sync only | Captures the "shared moment" core value; simpler state. |
| Pod scope | 1:1 partner pair, one active pod per user | Matches "couples app" framing; simplest schema. |
| MVP scope | Core loop + shopping list + pantry + ratings/notes + push | User selected. |
| Match reveal | Instant popup on second right-swipe | Highest dopamine; reinforces shared-experience framing. |
| Invite flow | Share-link / deep link | Lowest friction; works via any messaging app. |
| Deck history | Right-swipes excluded forever; left-swipes resurface after 30d | Avoids exhausting free-tier catalog; allows taste evolution. |
| Platforms | iOS + Android both at launch | Expo one-codebase advantage; couples app shouldn't gate by platform. |
| Realtime tech | Supabase Realtime (recommended) | Already in stack; meets latency targets; no extra vendor. |
| Quality bar | TDD + 90% coverage | Per brainstorm directive. |

### Resolved open questions 2026-05-21 (round 2)

| Decision | Choice | Rationale |
|---|---|---|
| Catalog freshness | Stay on Spoonacular free tier for now; paid tier acceptable later to expedite. | Not a blocker; 500-recipe floor reachable in ~3 weeks. |
| Spoonacular ToS | We have rights to store and re-display full recipe content. | Confirmed by user; enables full in-app recipe detail (no link-out fallback needed). |
| Match overlay UX | First-class dopamine surface — full motion, haptic, opt-in audio, variable rewards. | User directive: "Any way we can get more dopamine the better." Detailed in [`docs/MATCH-UX/README.md`](../MATCH-UX/README.md). |
| Deck size | 20 cards per session (configurable). | Starting point; revisit via PostHog metrics post-launch. |
| Re-pairing after dissolution | Fresh pod — no cookbook recovery. | Simplest mental model; avoids ex-partner data-recovery flows. |
| Spoonacular fuzzy dedup | Post-MVP. | Acceptable duplicate rate in catalog for v1. |
| Internationalization | English only in v1. | Spoonacular is English; defer locale infra. |
| Partner-removed-me UX | Clear in-app screen with "Invite someone new" CTA; no push notification on dissolution. | See FR-P6. |
| Push permission timing | Request after first pod is created. | Highest opt-in moment — user just created a 2-person object that benefits from notifications. |
| Analytics vendor | **PostHog**. | OSS, self-host option, feature flags + product analytics in one. |

---

## 11. Out of Scope (parking lot for v2+)

- Async / hybrid session mode.
- 3+ person pods (family meal planning).
- Meal-planning calendar (assign matches to specific days).
- Grocery delivery integrations (Instacart, Amazon Fresh).
- Recipe scaling / serving-size adjustments.
- User-authored recipes.
- Social features: friends, public cookbooks, recipe sharing across pods.
- Cooking mode: step-by-step hands-free instructions with timers.
- Photo capture of cooked dish for cookbook entries.
- Nutrition tracking integration.
- Apple Watch / wearable companion.
- Web client.

---

## 12. Next Steps

1. Review this PRD with stakeholders; resolve open questions in §9.
2. Run `/sc:design` to produce: architecture diagram, full schema with RLS policies, realtime channel design, deep-link spec, push notification spec.
3. Run `/sc:workflow` to break MVP scope into a phased task list with TDD checkpoints.
4. Stand up Spoonacular → Supabase ingestion job; let catalog backfill in parallel with development.
