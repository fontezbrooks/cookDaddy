-- 021_drop_dietary_flags.sql
-- Source: docs/DATABASE_REFACTOR/WORKFLOW B3.
-- Dietary info now lives in typed boolean columns on recipes (vegetarian, vegan,
-- gluten_free, ...) written by import_recipe_graph (020) from raw_payload. The legacy
-- dietary_flags jsonb is redundant. Dropping it also drops the dependent partial GIN
-- index ix_recipes_complete_dietary automatically. Confirmed safe: no app/src code reads
-- dietary_flags; the import_recipe_graph RPC does not reference it.
alter table recipes drop column dietary_flags;
