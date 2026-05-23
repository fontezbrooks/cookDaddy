# cookDaddy

Couples meal-decision app — Tinder-style live-synced recipe swiping, shared cookbook, shared shopping list with pantry awareness. Expo + Supabase + Clerk.

## Status

P0–P3 done: repo bootstrap, schema + RLS, Clerk-Supabase auth bridge, Spoonacular ingestion. Mobile app shell (P4) is next on the critical path. See [`docs/WORKFLOW/README.md`](./docs/WORKFLOW/README.md) for the full 14-phase delivery plan.

## Documentation

- [`docs/PRD/README.md`](./docs/PRD/README.md) — product requirements (v1 scope, locked decisions)
- [`docs/DESIGN/README.md`](./docs/DESIGN/README.md) — system architecture, schema, RLS, realtime channels
- [`docs/MATCH-UX/README.md`](./docs/MATCH-UX/README.md) — the dopamine surface; treat as authoritative for any code touching the match overlay, swipe feedback, or session-end summary
- [`docs/WORKFLOW/README.md`](./docs/WORKFLOW/README.md) — phase-gated implementation plan, exit criteria, quality gates

New docs go at `docs/<name>/README.md`, never `docs/<name>.md`.

## Local setup

Prerequisites: Node 22+, pnpm 11+, Docker (for local Supabase), the Expo development tooling, the Supabase CLI.

```bash
pnpm install
cp .env.example .env  # then fill in real keys
pnpm db:start         # boot local Supabase (Postgres + Edge runtime)
pnpm db:reset         # apply migrations + seed
pnpm db:test          # run pgTAP suite
pnpm start            # Expo dev server
pnpm ios              # iOS simulator
pnpm android          # Android emulator
```

Local Supabase listens on the `6432X` port range (shifted from the default `5432X` to coexist with other Supabase projects on the host) — API at `http://127.0.0.1:64321`.

## Clerk ↔ Supabase auth bridge (P2)

The mobile app authenticates with Clerk; Clerk's JWT template named `supabase` mints a Supabase-shaped JWT signed with the shared `JWT_SECRET`. `src/lib/supabase.ts` builds a Supabase client whose `accessToken` callback calls Clerk's `getToken({ template: 'supabase' })` on every request.

User identity is kept in sync via the `clerk-user-webhook` Edge Function (`supabase/functions/clerk-user-webhook/`): it verifies the Svix signature on Clerk's `user.created` / `user.updated` / `user.deleted` events and upserts/archives the `users` row. Webhook signature + payload logic lives in `supabase/functions/_shared/clerk-webhook.ts` so Jest can exercise it without Deno.

Required env vars (see `.env.example`):

| Var                                 | Purpose                                         |
| ----------------------------------- | ----------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`          | Mobile client target                            |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`     | Mobile client anon key                          |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk SDK init                                  |
| `CLERK_WEBHOOK_SECRET`              | Svix signing secret for the webhook             |
| `SUPABASE_SERVICE_ROLE_KEY`         | Service-role key used by the Edge Function only |

## Recipe ingestion (P3)

The hourly cron at `scripts/ingestion/cron-step.sh` calls `test-spoon.ps1` to fetch one random recipe into `RecipeJson/`, then `pnpm ingest` normalizes every new JSON into Supabase via service role:

- `scripts/ingestion/normalize.ts` — pure mapping (Spoonacular → `recipes` row + `recipe_ingredients[]`), dependency-free so Jest exercises it against real fixtures.
- `scripts/ingestion/import-spoon.ts` — CLI: idempotent upsert on `recipes.external_id`, ingredients are delete-and-reinserted in source order, `.imported.json` ledger skips already-processed files, per-file errors don't break the cron.
- A title-similarity ≥ 0.85 against existing rows emits PostHog `recipe_apparent_duplicate` for sizing the post-MVP fuzzy-dedup pipeline.

```bash
pnpm ingest:backfill   # one-off: process every file in RecipeJson/
pnpm ingest path.json  # single-file (cron path)
bash scripts/ingestion/setup-spoon-cron.sh  # install the hourly cron
```

Required env vars for the importer: `SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`. Optional: `POSTHOG_KEY`.

## Quality gates

Every PR must be green on:

| Gate         | Command                |
| ------------ | ---------------------- |
| Lint         | `pnpm lint`            |
| Format       | `pnpm format:check`    |
| Typecheck    | `pnpm typecheck`       |
| Tests (90%+) | `pnpm test:ci`         |
| Schema + RLS | `pnpm db:test` (pgTAP) |
| Secret scan  | `gitleaks detect` (CI) |

`pnpm format` auto-applies Prettier; the curated docs under `docs/` are exempt from formatting.

## Tech stack

- **App**: Expo SDK 56, expo-router, React Native 0.85, React 19, TypeScript strict
- **Auth**: Clerk → Supabase via JWT template (P2)
- **Backend**: Supabase (Postgres + Realtime + Edge Functions + Storage), local at `127.0.0.1:64321`
- **Realtime**: Supabase Realtime — Broadcast for swipes, Postgres Changes for shared lists, Presence for lobby
- **State**: Zustand (client), TanStack Query (server data)
- **Match UX**: react-native-reanimated, expo-haptics, react-native-skia, expo-audio (opt-in)
- **Analytics**: PostHog (cloud) with group analytics keyed on pod
- **Observability**: Sentry

## Repository layout

```
src/               app code
  app/             expo-router routes
  components/
  constants/
  hooks/
  lib/             supabase client, analytics wrapper, …
  state/           Zustand stores
supabase/
  config.toml      local stack config (ports shifted to 6432X)
  seed.sql         local-only: pgTAP + test helper functions
  migrations/      one migration per concern (see WORKFLOW §4)
  tests/           pgTAP tests (RLS + triggers + uniqueness)
  functions/
    _shared/       pure logic (Jest-testable)
    clerk-user-webhook/   Deno entry — Clerk → Supabase user sync
scripts/
  ingestion/       Spoonacular ingestion (P3); legacy cron lives here
docs/              product + design + workflow docs
RecipeJson/        raw Spoonacular dumps from the hourly cron
```

## Contributing

This is a TDD repo. From P1 onward, every PR is expected to land tests with the feature; the 90% coverage gate is enforced in CI.

See `docs/WORKFLOW/README.md` §19 for the project-wide Definition of Done.
