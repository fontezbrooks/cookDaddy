-- 006_recipes_and_ingredients.sql
-- Source: docs/DESIGN/README.md §3.2.5, §3.2.6
-- Recipe catalog populated from Spoonacular (P3). Public-read to any authenticated user;
-- no client writes (ingestion runs server-side with service role).

create table recipes (
  id               uuid primary key default gen_random_uuid(),
  external_id      bigint unique not null,
  title            text not null,
  image_url        text,
  source_url       text,
  source_name      text,
  credits_text     text,
  license          text,
  ready_in_minutes int,
  servings         int,
  health_score     numeric,
  dietary_flags    jsonb not null default '{}'::jsonb,
  raw_payload      jsonb not null,
  is_complete      boolean not null default true,
  created_at       timestamptz not null default now()
);

create index ix_recipes_complete_dietary
  on recipes
  using gin (dietary_flags)
  where is_complete = true;

create index ix_recipes_complete_created
  on recipes(created_at desc)
  where is_complete = true;

create table recipe_ingredients (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references recipes(id) on delete cascade,
  ext_ingredient_id bigint,
  name              text not null,
  name_clean        text,
  original_text     text,
  amount            numeric,
  unit              text,
  aisle             text,
  image_url         text,
  position          int not null
);

create index ix_recipe_ingredients_recipe on recipe_ingredients(recipe_id);
create unique index uq_recipe_ingredients_position on recipe_ingredients(recipe_id, position);
