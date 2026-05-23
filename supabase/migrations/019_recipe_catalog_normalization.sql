-- 019_recipe_catalog_normalization.sql
-- Source: docs/DATABASE_REFACTOR/DESIGN/README.md §2, §3, §4, §5, §6, §7
-- Normalize the recipe catalog around Spoonacular nutrition, instructions, tags, and
-- measures while preserving recipes.id uuid, external_id, raw_payload, and is_complete.

alter table recipes
  add column image_type text,
  add column spoonacular_source_url text,
  add column preparation_minutes int,
  add column cooking_minutes int,
  add column vegetarian boolean not null default false,
  add column vegan boolean not null default false,
  add column gluten_free boolean not null default false,
  add column dairy_free boolean not null default false,
  add column very_healthy boolean not null default false,
  add column cheap boolean not null default false,
  add column very_popular boolean not null default false,
  add column sustainable boolean not null default false,
  add column low_fodmap boolean not null default false,
  add column ketogenic boolean not null default false,
  add column whole30 boolean not null default false,
  add column weight_watcher_smart_points int,
  add column gaps text,
  add column aggregate_likes int,
  add column spoonacular_score numeric(8,2),
  add column price_per_serving_cents numeric(10,2),
  add column summary text,
  add column instructions text,
  add column language text,
  add column original_id text,
  add column caloric_percent_protein numeric(8,2),
  add column caloric_percent_fat numeric(8,2),
  add column caloric_percent_carbs numeric(8,2),
  add column weight_per_serving_amount numeric(10,2),
  add column weight_per_serving_unit text,
  add column updated_at timestamptz not null default now();

alter table recipe_ingredients rename column ext_ingredient_id to spoonacular_ingredient_id;
alter table recipe_ingredients rename column original_text to original;
alter table recipe_ingredients rename column image_url to image;
alter table recipe_ingredients rename column position to sort_order;
alter index uq_recipe_ingredients_position rename to uq_recipe_ingredients_sort_order;

alter table recipe_ingredients
  add column consistency text,
  add column original_name text,
  add column meta jsonb;

create table recipe_ingredient_measures (
  id                   uuid primary key default gen_random_uuid(),
  recipe_ingredient_id uuid not null references recipe_ingredients(id) on delete cascade,
  system               text not null check (system in ('us', 'metric')),
  amount               numeric(12,4),
  unit_short           text,
  unit_long            text
);

create table recipe_nutrients (
  id                     uuid primary key default gen_random_uuid(),
  recipe_id              uuid not null references recipes(id) on delete cascade,
  name                   text not null,
  amount                 numeric(14,4),
  unit                   text,
  percent_of_daily_needs numeric(10,4)
);

create table recipe_nutrition_properties (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name      text not null,
  amount    numeric(14,4),
  unit      text
);

create table recipe_flavonoids (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name      text not null,
  amount    numeric(14,4),
  unit      text
);

create table recipe_nutrition_ingredients (
  id                         uuid primary key default gen_random_uuid(),
  recipe_id                  uuid not null references recipes(id) on delete cascade,
  spoonacular_ingredient_id  bigint,
  name                       text not null,
  amount                     numeric(12,4),
  unit                       text,
  sort_order                 int
);

create table recipe_nutrition_ingredient_nutrients (
  id                                   uuid primary key default gen_random_uuid(),
  recipe_nutrition_ingredient_id       uuid not null references recipe_nutrition_ingredients(id) on delete cascade,
  name                                 text not null,
  amount                               numeric(14,4),
  unit                                 text,
  percent_of_daily_needs               numeric(10,4)
);

create table recipe_instruction_groups (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  name       text,
  sort_order int
);

create table recipe_instruction_steps (
  id                   uuid primary key default gen_random_uuid(),
  instruction_group_id uuid not null references recipe_instruction_groups(id) on delete cascade,
  step_number          int not null,
  step_text            text not null,
  length_number        int,
  length_unit          text,
  sort_order           int
);

create table recipe_instruction_step_ingredients (
  id                         uuid primary key default gen_random_uuid(),
  instruction_step_id        uuid not null references recipe_instruction_steps(id) on delete cascade,
  spoonacular_ingredient_id  bigint,
  name                       text,
  localized_name             text,
  image                      text
);

create table recipe_instruction_step_equipment (
  id                        uuid primary key default gen_random_uuid(),
  instruction_step_id       uuid not null references recipe_instruction_steps(id) on delete cascade,
  spoonacular_equipment_id  bigint,
  name                      text,
  localized_name            text,
  image                     text
);

create table recipe_tags (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  tag_type  text not null check (tag_type in ('cuisine', 'dish_type', 'diet', 'occasion')),
  value     text not null
);

alter table recipe_ingredient_measures enable row level security;
create policy recipe_ingredient_measures_auth_read on recipe_ingredient_measures
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_nutrients enable row level security;
create policy recipe_nutrients_auth_read on recipe_nutrients
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_nutrition_properties enable row level security;
create policy recipe_nutrition_properties_auth_read on recipe_nutrition_properties
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_flavonoids enable row level security;
create policy recipe_flavonoids_auth_read on recipe_flavonoids
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_nutrition_ingredients enable row level security;
create policy recipe_nutrition_ingredients_auth_read on recipe_nutrition_ingredients
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_nutrition_ingredient_nutrients enable row level security;
create policy recipe_nutrition_ingredient_nutrients_auth_read on recipe_nutrition_ingredient_nutrients
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_instruction_groups enable row level security;
create policy recipe_instruction_groups_auth_read on recipe_instruction_groups
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_instruction_steps enable row level security;
create policy recipe_instruction_steps_auth_read on recipe_instruction_steps
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_instruction_step_ingredients enable row level security;
create policy recipe_instruction_step_ingredients_auth_read on recipe_instruction_step_ingredients
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_instruction_step_equipment enable row level security;
create policy recipe_instruction_step_equipment_auth_read on recipe_instruction_step_equipment
  for select to authenticated
  using (auth_user_id() <> '');

alter table recipe_tags enable row level security;
create policy recipe_tags_auth_read on recipe_tags
  for select to authenticated
  using (auth_user_id() <> '');

create index ix_recipe_ingredient_measures_recipe_ingredient on recipe_ingredient_measures(recipe_ingredient_id);
create index ix_recipe_nutrients_recipe on recipe_nutrients(recipe_id);
create index ix_recipe_nutrients_name on recipe_nutrients(recipe_id, name);
create index ix_recipe_nutrition_properties_recipe on recipe_nutrition_properties(recipe_id);
create index ix_recipe_flavonoids_recipe on recipe_flavonoids(recipe_id);
create index ix_recipe_nutrition_ingredients_recipe on recipe_nutrition_ingredients(recipe_id);
create index ix_recipe_nutrition_ingredient_nutrients_recipe_nutrition_ingredient
  on recipe_nutrition_ingredient_nutrients(recipe_nutrition_ingredient_id);
create index ix_recipe_instruction_groups_recipe on recipe_instruction_groups(recipe_id);
create index ix_recipe_instruction_steps_instruction_group on recipe_instruction_steps(instruction_group_id);
create index ix_recipe_instruction_steps_order on recipe_instruction_steps(instruction_group_id, sort_order);
create index ix_recipe_instruction_step_ingredients_instruction_step on recipe_instruction_step_ingredients(instruction_step_id);
create index ix_recipe_instruction_step_equipment_instruction_step on recipe_instruction_step_equipment(instruction_step_id);
create index ix_recipe_tags_recipe on recipe_tags(recipe_id);
create index ix_recipe_tags_type_value on recipe_tags(tag_type, value);
create index ix_recipes_title_search on recipes using gin (to_tsvector('english', title));
create index ix_recipes_summary_search on recipes using gin (to_tsvector('english', summary));
create index ix_recipes_raw_payload on recipes using gin (raw_payload);

create view recipe_completeness with (security_invoker = true) as
select r.id,
  (r.title is not null and r.image_url is not null
   and exists (select 1 from recipe_ingredients i where i.recipe_id = r.id)
   and exists (select 1 from recipe_instruction_steps s
               join recipe_instruction_groups g on g.id = s.instruction_group_id
               where g.recipe_id = r.id)
   and exists (select 1 from recipe_nutrients n
               where n.recipe_id = r.id and n.name = 'Calories')) as should_be_complete,
  r.is_complete
from recipes r;
