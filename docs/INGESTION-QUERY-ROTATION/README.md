# Ingestion Query Rotation — Weekday-Cuisine × Per-Tick-Course

> Enhancement to `scripts/ingestion/test-spoon.ps1`: replace `/recipes/random`
> with `/recipes/complexSearch`, choosing **cuisine by weekday** and **course/
> equipment theme by tick**. Importer/normalizer are untouched.
>
> Status: **IMPLEMENTED & verified** (via `/sc:brainstorm` → `/sc:save` →
> `/sc:design` → `/sc:implement` via `codeagent`). `test-spoon.ps1` rewritten;
> pwsh AST parse clean, 46/46 ingestion TS tests pass, static URI check over all
> 84 cuisine×course combos passes. Uncommitted. Next: commit via `/sc:git`.

---

## 1. Requirements

### Goal
Seed a wider, more intentional recipe mix than the random endpoint gave, while
keeping the existing per-file `{recipes:[…]}` pipeline and its normalizer
(`normalize.ts`) and importer (`import-spoon.ts`) unchanged.

### Decided parameters
| Setting | Value |
|---|---|
| Endpoint | `GET /recipes/complexSearch` |
| Cadence | 12 ticks/day (cron every 2h) |
| `number` | 3 per tick |
| `sort` | `popularity` |
| Enrichment | `addRecipeInformation=true&addRecipeInstructions=true&addRecipeNutrition=true` |
| Global filters | `excludeIngredients=seafood,shellfish,peanut`, no dessert, dinner-appropriate courses only |
| Wrap/offset | Not needed — 12 unique themes for 12 ticks |

### Day → Cuisine (from ingestion server local clock)
| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|-----|-----|-----|-----|-----|-----|-----|
| Italian | Mexican | Asian | Indian | Mediterranean | American | French |

### Tick → Course theme
Tick index derived statelessly from run time: **`index = floor(hourOfDay / 2)`**
→ 0–11 across the 2-hourly schedule (restart-safe, deterministic).

| # | Theme | Param |
|---|-------|-------|
| 0 | One-pan / frying pan | `equipment=frying pan` |
| 1 | Soup | `type=soup` |
| 2 | Salad | `type=salad` |
| 3 | Slow cooker | `equipment=slow cooker` |
| 4 | Pressure cooker | `equipment=pressure cooker` |
| 5 | Air fryer | `equipment=airfryer` |
| 6 | Main course | `type=main course` |
| 7 | Appetizer | `type=appetizer` |
| 8 | Rice cooker | `equipment=rice cooker` |
| 9 | Stove | `equipment=stove` |
| 10 | Side dish | `type=side dish` |
| 11 | Fingerfood | `type=fingerfood` |

### Functional Requirements
- **FR1** Endpoint = `complexSearch` with the 3 enrichment flags.
- **FR2** Remap `results[]` → wrap each as `{recipes:[<result>]}`; keep per-file output + filename sanitization.
- **FR3** `cuisine` from local weekday (table above).
- **FR4** Course theme from `floor(hour/2)`; one `type` **or** `equipment` param per tick.
- **FR5** Global allergen + no-dessert filters on every query.
- **FR6** `sort=popularity`, `number=3`.
- **FR7** Preserve `X-API-Quota-*` header logging on final line.
- **FR8** Empty result set → log-and-continue (no tick failure).

### Non-Functional Requirements
- **NFR1** ~1.3 pts/tick × 12 ≈ **16 pts/day** (vs 200 cap).
- **NFR2** Zero changes to `import-spoon.ts` / `normalize.ts`.
- **NFR3** Stateless, time-derived tick-index (survives container restarts).
- **NFR4** Same (weekday, hour) → same (cuisine, course) pair.

### Acceptance Criteria
1. Monday hour 0 → 3 popular **Italian frying-pan** recipes, `{recipes:[…]}` shape.
2. Monday hour 6 → **Italian slow-cooker** recipes (same cuisine, different course).
3. Tuesday → **Mexican** across the same 12-course cycle.
4. Each output file passes `normalize.ts` (nutrition, ingredients, instructions present) and imports without error.
5. Allergen + no-dessert filters hold on every tick.
6. Quota headers still logged.

### Known risks
- **Sparse combos** (e.g. Italian + rice cooker) may return few/zero recipes → FR8 handles gracefully; daily intake volume varies.
- **Popularity staleness**: same top-3 per (cuisine, course) recur over weeks; importer `external_id` dedup absorbs it, but net-new intake tapers. Future enhancement: `offset`-by-week.

---

## 2. Design

### Component overview
All changes are confined to `scripts/ingestion/test-spoon.ps1`. Structure:

```
[config data]      $CuisineByDay (7)   +  $CourseCycle (12)
      │
[resolvers]        Get-CuisineForToday()  Get-CourseForTick()
      │
[url builder]      Build-ComplexSearchUri(cuisine, course)   ← URL-encodes values
      │
[fetch]            Invoke-WebRequest (keep, for X-API-Quota-* headers)
      │
[remap]            $body.results  →  foreach → { recipes = @($result) }   ← FR2
      │
[write]            RecipeJson/<safeTitle>.json                 (unchanged)
      │
[log]              wrote=N cuisine=… course=… tick=… quota_*=…
```

### Data structures (script constants)
- `$CuisineByDay` — indexed by `[int](Get-Date).DayOfWeek` (Sunday=0):
  `@('French','Italian','Mexican','Asian','Indian','Mediterranean','American')`
  (Sun, Mon, Tue, Wed, Thu, Fri, Sat).
- `$CourseCycle` — ordered array of 12 `@{ Param = 'equipment'|'type'; Value = '…' }`
  in the table order above.

### Resolvers
- `Get-CuisineForToday` → `$CuisineByDay[[int](Get-Date).DayOfWeek]`.
- `Get-CourseForTick` → `$CourseCycle[[math]::Floor((Get-Date).Hour / 2)]` (index 0–11).

### URL builder — `Build-ComplexSearchUri`
Base: `https://api.spoonacular.com/recipes/complexSearch?`
Query parts (all values via `[uri]::EscapeDataString` — several contain spaces:
"frying pan", "main course", "side dish", "slow cooker", "pressure cooker",
"rice cooker"):
- `cuisine=<cuisine>`
- `<course.Param>=<course.Value>`  (one of `type=` / `equipment=`)
- `excludeIngredients=seafood,shellfish,peanut`
- `sort=popularity`
- `number=3`
- `addRecipeInformation=true`
- `addRecipeInstructions=true`
- `addRecipeNutrition=true`
- `apiKey=<key>`

> "No dessert" is enforced structurally: the 12-theme cycle contains no dessert/
> breakfast/bread course, so a dessert `type` is never requested.

### Response shape contract (why enrichment flags are mandatory)
`complexSearch` returns `{ results: [...] }` with **minimal** objects by default.
The normalizer (`normalize.ts:284`) requires `payload.recipes[]` where each
recipe carries:
| Normalizer reads | Supplied by |
|---|---|
| `raw.id`, `raw.title`, `raw.image` | base result |
| `raw.readyInMinutes`, `servings`, `summary`, `sourceUrl`, … | `addRecipeInformation` |
| `raw.extendedIngredients[]` | `addRecipeInformation` |
| `raw.analyzedInstructions[]` | `addRecipeInstructions` |
| `raw.nutrition.{nutrients,properties,flavonoids,ingredients}` | `addRecipeNutrition` |

So the 3 flags are load-bearing — without them the wrapped files fail
normalization. `addRecipeNutrition=true` also auto-enables `addRecipeInformation`.

### Cost model (verify at runtime via quota headers)
Per tick: `1 (base) + 0.01×3 (results) + 0.025×3 (info) + 0.025×3 (instructions)
+ 0.025×3 (nutrition) ≈ 1.26 pts`. × 12 ticks ≈ **~16 pts/day** (cap 200).
No nutrient min/max filters are used, so the +1 pt nutrient-filter surcharge does
not apply.

### Verification plan (run via codeagent at implement time)
1. **Static:** build all 7×12 = 84 URIs, assert each is well-formed and every
   space-bearing value is percent-encoded.
2. **Shape:** feed a captured `complexSearch` response (with the 3 flags) through
   the remap → assert `{recipes:[…]}` → run the existing `normalize.ts` unit
   tests in `scripts/ingestion/__tests__` against it.
3. **Live smoke:** one tick per cuisine, assert files write and import without a
   normalization error; assert allergen exclusions hold.

### Out of scope (future)
- `offset`-by-week rotation to counter popularity staleness.
- Per-cuisine course tuning for sparse combos.
