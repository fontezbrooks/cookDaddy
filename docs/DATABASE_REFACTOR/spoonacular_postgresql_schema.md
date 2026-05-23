# PostgreSQL Schema for Spoonacular Recipe JSON

This document describes a normalized PostgreSQL database schema for importing and storing Spoonacular recipe JSON.

It is based on a Spoonacular recipe response shape that includes:

- One or more recipes under `recipes[]`
- Top-level recipe metadata
- Ingredient rows under `extendedIngredients[]`
- Nutrition data under `nutrition`
- Instruction data under `analyzedInstructions[]`
- List fields such as `cuisines`, `dishTypes`, `diets`, and `occasions`

The schema keeps high-value searchable fields relational while preserving deeply nested source data with `JSONB` where useful.

---

## Entity Overview

### Main Tables

| Table | Purpose |
|---|---|
| `recipes` | Main recipe metadata |
| `recipe_ingredients` | Ingredients from `extendedIngredients[]` |
| `recipe_ingredient_measures` | US and metric measurement details for each ingredient |
| `recipe_nutrients` | Recipe-level nutrition nutrients |
| `recipe_nutrition_properties` | Recipe-level nutrition properties like glycemic index |
| `recipe_flavonoids` | Recipe-level flavonoid data |
| `recipe_nutrition_ingredients` | Nutrition breakdown by ingredient |
| `recipe_nutrition_ingredient_nutrients` | Nutrients inside each nutrition ingredient |
| `recipe_instruction_groups` | Groups from `analyzedInstructions[]` |
| `recipe_instruction_steps` | Individual cooking steps |
| `recipe_instruction_step_ingredients` | Ingredients referenced by each instruction step |
| `recipe_instruction_step_equipment` | Equipment referenced by each instruction step |
| `recipe_tags` | Normalized tags for cuisines, diets, dish types, and occasions |

---

# Tables

## `recipes`

Stores the top-level recipe object.

```sql
CREATE TABLE recipes (
    id BIGINT PRIMARY KEY,

    title TEXT NOT NULL,
    image_url TEXT,
    image_type TEXT,

    ready_in_minutes INTEGER,
    servings INTEGER,

    source_url TEXT,
    spoonacular_source_url TEXT,
    source_name TEXT,
    credits_text TEXT,
    license TEXT,

    vegetarian BOOLEAN DEFAULT FALSE,
    vegan BOOLEAN DEFAULT FALSE,
    gluten_free BOOLEAN DEFAULT FALSE,
    dairy_free BOOLEAN DEFAULT FALSE,
    very_healthy BOOLEAN DEFAULT FALSE,
    cheap BOOLEAN DEFAULT FALSE,
    very_popular BOOLEAN DEFAULT FALSE,
    sustainable BOOLEAN DEFAULT FALSE,
    low_fodmap BOOLEAN DEFAULT FALSE,

    weight_watcher_smart_points INTEGER,
    gaps TEXT,

    preparation_minutes INTEGER,
    cooking_minutes INTEGER,

    aggregate_likes INTEGER,
    health_score NUMERIC(8,2),
    spoonacular_score NUMERIC(8,2),

    price_per_serving_cents NUMERIC(10,2),

    summary TEXT,
    instructions TEXT,
    language TEXT,
    original_id TEXT,

    caloric_percent_protein NUMERIC(8,2),
    caloric_percent_fat NUMERIC(8,2),
    caloric_percent_carbs NUMERIC(8,2),

    weight_per_serving_amount NUMERIC(10,2),
    weight_per_serving_unit TEXT,

    raw_json JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Notes

- `id` maps to Spoonacular’s recipe ID.
- `price_per_serving_cents` stores values like `2052.66`, meaning about `$20.53` per serving.
- `raw_json` stores the full original recipe object as a safety net.
- `summary` may contain HTML from Spoonacular, so the app layer should sanitize it before rendering.

---

## `recipe_ingredients`

Stores each object from `extendedIngredients[]`.

```sql
CREATE TABLE recipe_ingredients (
    id BIGSERIAL PRIMARY KEY,

    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

    spoonacular_ingredient_id BIGINT,

    aisle TEXT,
    image TEXT,
    consistency TEXT,

    name TEXT NOT NULL,
    name_clean TEXT,

    original TEXT,
    original_name TEXT,

    amount NUMERIC(12,4),
    unit TEXT,

    meta JSONB,

    sort_order INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Notes

- `meta` should be stored as `JSONB` because it is an array of strings and varies by ingredient.
- `sort_order` preserves the order from the source JSON.
- Ingredient IDs can repeat, so do **not** make `spoonacular_ingredient_id` unique.

---

## `recipe_ingredient_measures`

Stores `measures.us` and `measures.metric`.

```sql
CREATE TABLE recipe_ingredient_measures (
    id BIGSERIAL PRIMARY KEY,

    recipe_ingredient_id BIGINT NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,

    system TEXT NOT NULL CHECK (system IN ('us', 'metric')),

    amount NUMERIC(12,4),
    unit_short TEXT,
    unit_long TEXT
);
```

### Example Systems

```text
us
metric
```

---

## `recipe_nutrients`

Stores recipe-level nutrition values from `nutrition.nutrients[]`.

```sql
CREATE TABLE recipe_nutrients (
    id BIGSERIAL PRIMARY KEY,

    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    amount NUMERIC(14,4),
    unit TEXT,
    percent_of_daily_needs NUMERIC(10,4)
);
```

### Example Nutrients

```text
Calories
Fat
Saturated Fat
Carbohydrates
Protein
Sodium
Vitamin A
Vitamin C
Iron
```

---

## `recipe_nutrition_properties`

Stores values from `nutrition.properties[]`.

```sql
CREATE TABLE recipe_nutrition_properties (
    id BIGSERIAL PRIMARY KEY,

    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    amount NUMERIC(14,4),
    unit TEXT
);
```

### Example Properties

```text
Glycemic Index
Glycemic Load
Inflammation Score
Nutrition Score
```

---

## `recipe_flavonoids`

Stores values from `nutrition.flavonoids[]`.

```sql
CREATE TABLE recipe_flavonoids (
    id BIGSERIAL PRIMARY KEY,

    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    amount NUMERIC(14,4),
    unit TEXT
);
```

---

## `recipe_nutrition_ingredients`

Stores ingredient-level nutrition summaries from `nutrition.ingredients[]`.

```sql
CREATE TABLE recipe_nutrition_ingredients (
    id BIGSERIAL PRIMARY KEY,

    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

    spoonacular_ingredient_id BIGINT,

    name TEXT NOT NULL,
    amount NUMERIC(12,4),
    unit TEXT,

    sort_order INTEGER
);
```

---

## `recipe_nutrition_ingredient_nutrients`

Stores nutrients nested inside each `nutrition.ingredients[].nutrients[]`.

```sql
CREATE TABLE recipe_nutrition_ingredient_nutrients (
    id BIGSERIAL PRIMARY KEY,

    recipe_nutrition_ingredient_id BIGINT NOT NULL
        REFERENCES recipe_nutrition_ingredients(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    amount NUMERIC(14,4),
    unit TEXT,
    percent_of_daily_needs NUMERIC(10,4)
);
```

---

## `recipe_instruction_groups`

Stores each object from `analyzedInstructions[]`.

```sql
CREATE TABLE recipe_instruction_groups (
    id BIGSERIAL PRIMARY KEY,

    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

    name TEXT,
    sort_order INTEGER
);
```

---

## `recipe_instruction_steps`

Stores each instruction step.

```sql
CREATE TABLE recipe_instruction_steps (
    id BIGSERIAL PRIMARY KEY,

    instruction_group_id BIGINT NOT NULL
        REFERENCES recipe_instruction_groups(id) ON DELETE CASCADE,

    step_number INTEGER NOT NULL,
    step_text TEXT NOT NULL,

    length_number INTEGER,
    length_unit TEXT,

    sort_order INTEGER
);
```

### Notes

Some steps may have an optional `length` object, usually representing time.

Example:

```json
{
  "length": {
    "number": 10,
    "unit": "minutes"
  }
}
```

---

## `recipe_instruction_step_ingredients`

Stores ingredients referenced inside each analyzed instruction step.

```sql
CREATE TABLE recipe_instruction_step_ingredients (
    id BIGSERIAL PRIMARY KEY,

    instruction_step_id BIGINT NOT NULL
        REFERENCES recipe_instruction_steps(id) ON DELETE CASCADE,

    spoonacular_ingredient_id BIGINT,

    name TEXT,
    localized_name TEXT,
    image TEXT
);
```

---

## `recipe_instruction_step_equipment`

Stores equipment referenced inside each analyzed instruction step.

```sql
CREATE TABLE recipe_instruction_step_equipment (
    id BIGSERIAL PRIMARY KEY,

    instruction_step_id BIGINT NOT NULL
        REFERENCES recipe_instruction_steps(id) ON DELETE CASCADE,

    spoonacular_equipment_id BIGINT,

    name TEXT,
    localized_name TEXT,
    image TEXT
);
```

---

## `recipe_tags`

Stores list-style fields from the recipe object.

These include:

- `cuisines[]`
- `dishTypes[]`
- `diets[]`
- `occasions[]`

```sql
CREATE TABLE recipe_tags (
    id BIGSERIAL PRIMARY KEY,

    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

    tag_type TEXT NOT NULL CHECK (
        tag_type IN ('cuisine', 'dish_type', 'diet', 'occasion')
    ),

    value TEXT NOT NULL
);
```

### Example Rows

| recipe_id | tag_type | value |
|---:|---|---|
| `633096` | `dish_type` | `lunch` |
| `633096` | `dish_type` | `main course` |
| `633096` | `diet` | `gluten free` |

---

# Recommended Indexes

```sql
CREATE INDEX idx_recipes_title
ON recipes USING GIN (to_tsvector('english', title));

CREATE INDEX idx_recipes_summary
ON recipes USING GIN (to_tsvector('english', summary));

CREATE INDEX idx_recipe_ingredients_recipe_id
ON recipe_ingredients(recipe_id);

CREATE INDEX idx_recipe_ingredients_name
ON recipe_ingredients(name);

CREATE INDEX idx_recipe_nutrients_recipe_id
ON recipe_nutrients(recipe_id);

CREATE INDEX idx_recipe_nutrients_name
ON recipe_nutrients(name);

CREATE INDEX idx_recipe_tags_recipe_id
ON recipe_tags(recipe_id);

CREATE INDEX idx_recipe_tags_type_value
ON recipe_tags(tag_type, value);

CREATE INDEX idx_recipes_raw_json
ON recipes USING GIN (raw_json);
```

---

# Import Mapping

## Top-Level Recipe Fields

| JSON Field | PostgreSQL Column |
|---|---|
| `id` | `recipes.id` |
| `title` | `recipes.title` |
| `image` | `recipes.image_url` |
| `imageType` | `recipes.image_type` |
| `readyInMinutes` | `recipes.ready_in_minutes` |
| `servings` | `recipes.servings` |
| `sourceUrl` | `recipes.source_url` |
| `spoonacularSourceUrl` | `recipes.spoonacular_source_url` |
| `sourceName` | `recipes.source_name` |
| `creditsText` | `recipes.credits_text` |
| `license` | `recipes.license` |
| `vegetarian` | `recipes.vegetarian` |
| `vegan` | `recipes.vegan` |
| `glutenFree` | `recipes.gluten_free` |
| `dairyFree` | `recipes.dairy_free` |
| `veryHealthy` | `recipes.very_healthy` |
| `cheap` | `recipes.cheap` |
| `veryPopular` | `recipes.very_popular` |
| `sustainable` | `recipes.sustainable` |
| `lowFodmap` | `recipes.low_fodmap` |
| `weightWatcherSmartPoints` | `recipes.weight_watcher_smart_points` |
| `gaps` | `recipes.gaps` |
| `preparationMinutes` | `recipes.preparation_minutes` |
| `cookingMinutes` | `recipes.cooking_minutes` |
| `aggregateLikes` | `recipes.aggregate_likes` |
| `healthScore` | `recipes.health_score` |
| `spoonacularScore` | `recipes.spoonacular_score` |
| `pricePerServing` | `recipes.price_per_serving_cents` |
| `summary` | `recipes.summary` |
| `instructions` | `recipes.instructions` |
| `language` | `recipes.language` |
| `originalId` | `recipes.original_id` |

---

# Recommended Agent Instructions

Use this when handing off to another agent:

```text
Create a PostgreSQL database schema for importing Spoonacular recipe JSON. Use the normalized schema described in this markdown. Implement tables, primary keys, foreign keys, indexes, and import logic.

Important requirements:
1. Insert each recipe into `recipes`.
2. Store the full original recipe object in `recipes.raw_json`.
3. Insert `extendedIngredients[]` into `recipe_ingredients`.
4. Insert each ingredient's `measures.us` and `measures.metric` into `recipe_ingredient_measures`.
5. Insert `nutrition.nutrients[]`, `nutrition.properties[]`, and `nutrition.flavonoids[]` into their respective tables.
6. Insert `nutrition.ingredients[]` into `recipe_nutrition_ingredients`.
7. Insert nested nutrition ingredient nutrients into `recipe_nutrition_ingredient_nutrients`.
8. Insert `analyzedInstructions[]` into instruction group and step tables.
9. Insert cuisines, dishTypes, diets, and occasions into `recipe_tags`.
10. Preserve source ordering using `sort_order` columns.
11. Use `ON DELETE CASCADE` for child tables.
12. Make imports idempotent by upserting on `recipes.id`.
```

---

# Minimal Version

For a simpler first implementation, use only these tables:

```text
recipes
recipe_ingredients
recipe_nutrients
recipe_instruction_steps
recipe_tags
```

Then keep the full untouched JSON in:

```text
recipes.raw_json
```

That gives you searchability without having to unpack every tiny Spoonacular nutrition goblin on day one.
