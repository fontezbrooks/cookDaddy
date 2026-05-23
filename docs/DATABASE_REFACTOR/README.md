# Database Refactor — Spike Requirements

**Status:** requirements discovery complete (2026-05-23). Next step: `/sc:design` for the migration + schema design, then `/sc:workflow` for phasing.

**Target schema:** [spoonacular_postgresql_schema.md](./spoonacular_postgresql_schema.md) — the authoritative end-state shape.

---

## 1. Goal

Refactor the cookDaddy recipe catalog in Supabase to the normalized shape in `spoonacular_postgresql_schema.md` — exploding the nested Spoonacular JSON (nutrition, instructions, measures, tags) into relational tables — then bring the ingestion pipeline and app code into alignment.

This is a **recipe-catalog refactor**. The social/session schema (pods, sessions, swipes, matches, ratings, shopping_list) is **not** structurally changed.

## 2. Locked decisions (2026-05-23)

| # | Decision | Choice | Implication |
|---|---|---|---|
| D1 | Recipe primary key | **Keep `uuid` surrogate**; Spoonacular id stays `external_id bigint` | matches/swipes/sessions(`deck_recipe_ids uuid[]`)/ratings/shopping FKs + RPCs + P9 code **unchanged**. New child tables FK to the recipe uuid. Deviates from the doc's literal `id BIGINT PRIMARY KEY` — intentional. |
| D2 | Scope | **Full 13-table normalization** | All tables incl. flavonoids, per-ingredient nutrition + nested nutrients, instruction step ingredients/equipment. |
| D3 | Backfill source | **Re-derive from `raw_payload`** | Explode stored JSONB; zero Spoonacular API spend. Viable: ingestion fetched `includeNutrition=true` and stores the full object. |
| D4 | Phase bridge | **Lockstep, accept brief red** | Pre-launch / single dev / no real users. No compatibility views. |
| D5 | "Complete" definition | **Redefine against the new tables** | Replace the flat `is_complete` boolean with a richer predicate: a recipe is deck-eligible only when it can render every near-term surface (see FR4). |
| D6 | Near-term feature drivers | **Nutrition display + cooking-mode (instruction steps)** | These justify the full normalization now and set P-C UI priority: `recipe_nutrients` and `recipe_instruction_groups/steps` get consumed first (see FR6/FR7). |

## 3. Scope

### In scope
- New tables (FK to recipe uuid): `recipe_ingredient_measures`, `recipe_nutrients`, `recipe_nutrition_properties`, `recipe_flavonoids`, `recipe_nutrition_ingredients`, `recipe_nutrition_ingredient_nutrients`, `recipe_instruction_groups`, `recipe_instruction_steps`, `recipe_instruction_step_ingredients`, `recipe_instruction_step_equipment`, `recipe_tags`.
- New columns on `recipes` (dietary booleans, scores, prep/cook minutes, summary, price, caloric breakdown, etc.) per the target doc, keeping uuid PK + `external_id`.
- Reconciling `recipe_ingredients` (add `consistency`, `original_name`, `meta`, measures relationship; reconcile names: `original_text`/`original`, `position`/`sort_order`, `image_url`/`image`, `ext_ingredient_id`/`spoonacular_ingredient_id`).
- RLS policies for every new table (catalog-read pattern: authenticated SELECT; writes via service-role ingestion only).
- Backfill script: derive all new tables from existing `raw_payload` for the ~70 cloud recipes.
- Ingestion rewrite: `normalize.ts` + `import-spoon.ts` populate all tables idempotently (upsert on `recipes.external_id`); preserve source ordering via `sort_order`.
- App code: extend `use-match-detail` (and any new hooks) to read the richer data; existing recipe-id-keyed hooks/RPCs continue working unchanged (uuid preserved).

### Out of scope
- No change to pods/sessions/swipes/matches/ratings/shopping_list structure or RPC signatures.
- No new product UI in this refactor (nutrition/cooking-mode screens are downstream features, separately phased).
- Not adopting bigint recipe PK (see D1).

## 4. Functional requirements

- **FR1** Every field in the target doc's import-mapping is persisted into its table; the full object remains in `recipes.raw_json`/`raw_payload`.
- **FR2** Backfill is idempotent and re-runnable; running it twice yields identical rows (no duplication). Child rows are delete-and-reinsert or upsert keyed to preserve `sort_order`.
- **FR3** Ingestion (cron path) writes the full normalized graph for each new recipe in one idempotent upsert keyed on `external_id`.
- **FR4** Recipe **completeness (deck-eligibility) is redefined against the new tables** (resolves Q1/D5): a recipe is complete only when it can render every near-term surface — **title + image, ≥1 ingredient, ≥1 ordered instruction step, and ≥1 nutrient including Calories**. `compute_session_deck` gates on this richer predicate (replacing the flat `is_complete` boolean). The mechanism (generated column vs. maintained flag vs. view) is a `/sc:design` choice; the *requirement* is the predicate above. Recipes failing it are excluded from decks and reported as backfill/ingestion gaps (ties to R2).
- **FR5** App reads (`use-deck`, `use-match-detail`, `use-pod-matches`, `use-session-matches`) return the same or richer data; no regression in the swipe/cookbook surfaces shipped in P9.
- **FR6** **Nutrition display** (driver D6): the recipe-detail surface can render `recipe_nutrients` (at minimum Calories + macros: Fat/Carbohydrates/Protein) for any deck/cookbook recipe.
- **FR7** **Cooking-mode** (driver D6): ordered instruction steps (`recipe_instruction_groups` → `recipe_instruction_steps`, by `sort_order`/`step_number`) are queryable to drive a step-by-step cooking view, including optional per-step `length` (time).

## 5. Non-functional requirements

- **NFR1 (data safety)** No loss of existing recipes/matches/sessions. Catalog child tables are rebuilt from `raw_payload`; recipes + social data preserved (uuid PK unchanged).
- **NFR2 (test bar)** Maintain project gate: 90% line / 80% branch. pgTAP for new RLS + table constraints; Jest for the rewritten normalize/importer + updated hooks.
- **NFR3 (ingestion cost)** Backfill uses 0 Spoonacular points (raw_payload re-derivation).
- **NFR4 (cron coordination)** The 2-hourly ingestion cron MUST be paused during the migration window and only resumed once the rewritten importer + schema are both live (lockstep).
- **NFR5 (verification path)** Migrations verified against cloud via the existing savepoint-munging dry-run pattern (local Docker space-constrained).

## 6. Phase breakdown (high-level — detailed in /sc:workflow)

- **P-A — Schema migration:** new migration(s) adding 10+ tables, new `recipes` columns, indexes, RLS. Verified via pgTAP dry-run.
- **P-B — Backfill + ingestion rewrite:** `raw_payload` → normalized backfill script; rewrite `normalize.ts`/`import-spoon.ts` to populate the full graph; pause/resume cron.
- **P-C — App alignment:** extend hooks/components to consume richer data; confirm no P9 regression; full suite + coverage.

## 7. Acceptance criteria

- All 13 target tables exist with FKs, indexes, and RLS; `tsc`/`lint`/Jest/pgTAP green; coverage gate held.
- The ~70 cloud recipes have fully populated nutrition/instruction/tag/measure rows derived from `raw_payload`.
- Cron resumes and a fresh ingest populates the full graph idempotently.
- P9 cookbook/swipe surfaces work unchanged; recipe detail can render ingredients + (newly available) nutrition/instructions.

## 8. Open questions

**Resolved 2026-05-23:**
- ~~`is_complete` gating~~ → **redefined against the new tables** (D5 / FR4).
- ~~Feature driver / UI surfacing~~ → **nutrition display + cooking-mode** (D6 / FR6 / FR7).

**Remaining — design-detail, safe defaults noted, confirm during `/sc:design`:**
1. **Dev catalog disposability** — backfill may delete-and-rebuild the catalog child tables in place (D4 lockstep ⇒ brief downtime is acceptable). _Default: yes, rebuild in place._
2. **`recipe_ingredients` child PK** — under D1 (uuid recipe PK), keep child-table PKs as `uuid` (project convention) or follow the doc's `BIGSERIAL`. _Default: uuid, for project consistency._
3. **Tag normalization depth** — `recipe_tags` as free-text `value` per the doc, or dedupe into a `tags` dimension table. _Default: free-text per the doc._

## 9. Key risks

- **R1** Ingestion rewrite is the highest-effort piece (one nested upsert across 13 tables, idempotent). Mitigation: pure `normalize.ts` returning a typed graph + heavy fixture tests before touching the DB writer.
- **R2** `raw_payload` completeness per-recipe varies (some recipes may lack `analyzedInstructions` / nutrition). Backfill must tolerate missing branches gracefully (the current `is_complete` flag hints some are partial).
- **R3** Column renames on `recipe_ingredients` touch the P9 `use-match-detail` reads — must update in lockstep (P-C).
