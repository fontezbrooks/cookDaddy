-- Source: docs/DATABASE_REFACTOR/WORKFLOW/README.md §2, §3; migration 019.
-- pgTAP coverage for the normalized recipe catalog tables created in
-- 019_recipe_catalog_normalization.sql.

begin;
select plan(39);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures: one recipe with one row in each normalized catalog table.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_recipe('Normalized Catalog Fixture') as recipe \gset

select tests.as_service();
insert into public.recipes(id, external_id, title, image_url, raw_payload)
  values (gen_random_uuid(), 910000001, 'Complete View Fixture', 'https://example.test/complete.jpg', '{}'::jsonb)
  returning id as complete_recipe \gset

insert into public.recipes(id, external_id, title, image_url, raw_payload)
  values (gen_random_uuid(), 910000002, 'Incomplete View Fixture', 'https://example.test/incomplete.jpg', '{}'::jsonb)
  returning id as incomplete_recipe \gset

insert into public.recipe_ingredients(recipe_id, name, sort_order)
  values ((:'recipe')::uuid, 'salt', 0)
  returning id as ingredient \gset

insert into public.recipe_ingredient_measures(recipe_ingredient_id, system, amount, unit_short, unit_long)
  values ((:'ingredient')::uuid, 'us', 1, 'tsp', 'teaspoon')
  returning id as measure \gset

insert into public.recipe_nutrients(recipe_id, name, amount, unit, percent_of_daily_needs)
  values ((:'recipe')::uuid, 'Calories', 120, 'kcal', 6)
  returning id as nutrient \gset

insert into public.recipe_nutrition_properties(recipe_id, name, amount, unit)
  values ((:'recipe')::uuid, 'Glycemic Index', 12, '')
  returning id as property \gset

insert into public.recipe_flavonoids(recipe_id, name, amount, unit)
  values ((:'recipe')::uuid, 'Cyanidin', 0.5, 'mg')
  returning id as flavonoid \gset

insert into public.recipe_nutrition_ingredients(recipe_id, spoonacular_ingredient_id, name, amount, unit, sort_order)
  values ((:'recipe')::uuid, 1001, 'salt', 1, 'tsp', 0)
  returning id as nutrition_ingredient \gset

insert into public.recipe_nutrition_ingredient_nutrients(
  recipe_nutrition_ingredient_id, name, amount, unit, percent_of_daily_needs
)
  values ((:'nutrition_ingredient')::uuid, 'Sodium', 300, 'mg', 13)
  returning id as nutrition_ingredient_nutrient \gset

insert into public.recipe_instruction_groups(recipe_id, name, sort_order)
  values ((:'recipe')::uuid, 'Main', 0)
  returning id as instruction_group \gset

insert into public.recipe_instruction_steps(instruction_group_id, step_number, step_text, sort_order)
  values ((:'instruction_group')::uuid, 1, 'Season the dish.', 0)
  returning id as instruction_step \gset

insert into public.recipe_instruction_step_ingredients(
  instruction_step_id, spoonacular_ingredient_id, name, localized_name, image
)
  values ((:'instruction_step')::uuid, 1001, 'salt', 'salt', 'salt.png')
  returning id as instruction_step_ingredient \gset

insert into public.recipe_instruction_step_equipment(
  instruction_step_id, spoonacular_equipment_id, name, localized_name, image
)
  values ((:'instruction_step')::uuid, 2001, 'bowl', 'bowl', 'bowl.png')
  returning id as instruction_step_equipment \gset

insert into public.recipe_tags(recipe_id, tag_type, value)
  values ((:'recipe')::uuid, 'cuisine', 'French')
  returning id as tag \gset

-- Fixtures for recipe_completeness.
insert into public.recipe_ingredients(recipe_id, name, sort_order)
  values ((:'complete_recipe')::uuid, 'flour', 0);
insert into public.recipe_instruction_groups(recipe_id, name, sort_order)
  values ((:'complete_recipe')::uuid, 'Main', 0)
  returning id as complete_group \gset
insert into public.recipe_instruction_steps(instruction_group_id, step_number, step_text, sort_order)
  values ((:'complete_group')::uuid, 1, 'Mix.', 0);
insert into public.recipe_nutrients(recipe_id, name, amount, unit, percent_of_daily_needs)
  values ((:'complete_recipe')::uuid, 'Calories', 250, 'kcal', 12);

insert into public.recipe_ingredients(recipe_id, name, sort_order)
  values ((:'incomplete_recipe')::uuid, 'water', 0);
insert into public.recipe_instruction_groups(recipe_id, name, sort_order)
  values ((:'incomplete_recipe')::uuid, 'Main', 0)
  returning id as incomplete_group \gset
insert into public.recipe_instruction_steps(instruction_group_id, step_number, step_text, sort_order)
  values ((:'incomplete_group')::uuid, 1, 'Stir.', 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Authenticated users can read all normalized catalog tables.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_three_users();
select tests.as_user('user_carol');

select is((select count(*)::int from public.recipe_ingredient_measures where id = (:'measure')::uuid), 1,
  'authed reads recipe_ingredient_measures');
select is((select count(*)::int from public.recipe_nutrients where id = (:'nutrient')::uuid), 1,
  'authed reads recipe_nutrients');
select is((select count(*)::int from public.recipe_nutrition_properties where id = (:'property')::uuid), 1,
  'authed reads recipe_nutrition_properties');
select is((select count(*)::int from public.recipe_flavonoids where id = (:'flavonoid')::uuid), 1,
  'authed reads recipe_flavonoids');
select is((select count(*)::int from public.recipe_nutrition_ingredients where id = (:'nutrition_ingredient')::uuid), 1,
  'authed reads recipe_nutrition_ingredients');
select is((select count(*)::int from public.recipe_nutrition_ingredient_nutrients where id = (:'nutrition_ingredient_nutrient')::uuid), 1,
  'authed reads recipe_nutrition_ingredient_nutrients');
select is((select count(*)::int from public.recipe_instruction_groups where id = (:'instruction_group')::uuid), 1,
  'authed reads recipe_instruction_groups');
select is((select count(*)::int from public.recipe_instruction_steps where id = (:'instruction_step')::uuid), 1,
  'authed reads recipe_instruction_steps');
select is((select count(*)::int from public.recipe_instruction_step_ingredients where id = (:'instruction_step_ingredient')::uuid), 1,
  'authed reads recipe_instruction_step_ingredients');
select is((select count(*)::int from public.recipe_instruction_step_equipment where id = (:'instruction_step_equipment')::uuid), 1,
  'authed reads recipe_instruction_step_equipment');
select is((select count(*)::int from public.recipe_tags where id = (:'tag')::uuid), 1,
  'authed reads recipe_tags');

-- ─────────────────────────────────────────────────────────────────────────────
-- Anon sees zero rows because the new RLS policies are authenticated-only.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.as_anon();

select is_empty($$ select id from public.recipe_ingredient_measures            $$,
  'anon reads zero recipe_ingredient_measures');
select is_empty($$ select id from public.recipe_nutrients                      $$,
  'anon reads zero recipe_nutrients');
select is_empty($$ select id from public.recipe_nutrition_properties           $$,
  'anon reads zero recipe_nutrition_properties');
select is_empty($$ select id from public.recipe_flavonoids                     $$,
  'anon reads zero recipe_flavonoids');
select is_empty($$ select id from public.recipe_nutrition_ingredients          $$,
  'anon reads zero recipe_nutrition_ingredients');
select is_empty($$ select id from public.recipe_nutrition_ingredient_nutrients $$,
  'anon reads zero recipe_nutrition_ingredient_nutrients');
select is_empty($$ select id from public.recipe_instruction_groups             $$,
  'anon reads zero recipe_instruction_groups');
select is_empty($$ select id from public.recipe_instruction_steps              $$,
  'anon reads zero recipe_instruction_steps');
select is_empty($$ select id from public.recipe_instruction_step_ingredients   $$,
  'anon reads zero recipe_instruction_step_ingredients');
select is_empty($$ select id from public.recipe_instruction_step_equipment     $$,
  'anon reads zero recipe_instruction_step_equipment');
select is_empty($$ select id from public.recipe_tags                           $$,
  'anon reads zero recipe_tags');

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK constraints accept the known enums and reject invalid values.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.as_service();

select throws_ok(
  format(
    $$ insert into public.recipe_ingredient_measures(recipe_ingredient_id, system)
       values (%L::uuid, 'imperial') $$,
    :'ingredient'
  ),
  '23514',
  null,
  'recipe_ingredient_measures rejects invalid system'
);

select lives_ok(
  format(
    $$ insert into public.recipe_ingredient_measures(recipe_ingredient_id, system)
       values (%L::uuid, 'us'), (%L::uuid, 'metric') $$,
    :'ingredient', :'ingredient'
  ),
  'recipe_ingredient_measures accepts us and metric systems'
);

select throws_ok(
  format(
    $$ insert into public.recipe_tags(recipe_id, tag_type, value)
       values (%L::uuid, 'snack', 'Snack') $$,
    :'recipe'
  ),
  '23514',
  null,
  'recipe_tags rejects invalid tag_type'
);

select lives_ok(
  format(
    $$ insert into public.recipe_tags(recipe_id, tag_type, value)
       values
         (%L::uuid, 'cuisine', 'Italian'),
         (%L::uuid, 'dish_type', 'Dinner'),
         (%L::uuid, 'diet', 'Vegetarian'),
         (%L::uuid, 'occasion', 'Weeknight') $$,
    :'recipe', :'recipe', :'recipe', :'recipe'
  ),
  'recipe_tags accepts cuisine, dish_type, diet, and occasion tag types'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ON DELETE CASCADE reaches every new descendant table.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_recipe('Cascade Fixture') as cascade_recipe \gset

select tests.as_service();
insert into public.recipe_ingredients(recipe_id, name, sort_order)
  values ((:'cascade_recipe')::uuid, 'pepper', 0)
  returning id as cascade_ingredient \gset
insert into public.recipe_ingredient_measures(recipe_ingredient_id, system, amount)
  values ((:'cascade_ingredient')::uuid, 'metric', 2)
  returning id as cascade_measure \gset
insert into public.recipe_nutrients(recipe_id, name, amount, unit)
  values ((:'cascade_recipe')::uuid, 'Calories', 10, 'kcal')
  returning id as cascade_nutrient \gset
insert into public.recipe_nutrition_properties(recipe_id, name, amount, unit)
  values ((:'cascade_recipe')::uuid, 'Glycemic Load', 1, '')
  returning id as cascade_property \gset
insert into public.recipe_flavonoids(recipe_id, name, amount, unit)
  values ((:'cascade_recipe')::uuid, 'Quercetin', 1, 'mg')
  returning id as cascade_flavonoid \gset
insert into public.recipe_nutrition_ingredients(recipe_id, name, sort_order)
  values ((:'cascade_recipe')::uuid, 'pepper', 0)
  returning id as cascade_nutrition_ingredient \gset
insert into public.recipe_nutrition_ingredient_nutrients(recipe_nutrition_ingredient_id, name, amount, unit)
  values ((:'cascade_nutrition_ingredient')::uuid, 'Fiber', 1, 'g')
  returning id as cascade_nutrition_ingredient_nutrient \gset
insert into public.recipe_instruction_groups(recipe_id, name, sort_order)
  values ((:'cascade_recipe')::uuid, 'Main', 0)
  returning id as cascade_group \gset
insert into public.recipe_instruction_steps(instruction_group_id, step_number, step_text, sort_order)
  values ((:'cascade_group')::uuid, 1, 'Add pepper.', 0)
  returning id as cascade_step \gset
insert into public.recipe_instruction_step_ingredients(instruction_step_id, name)
  values ((:'cascade_step')::uuid, 'pepper')
  returning id as cascade_step_ingredient \gset
insert into public.recipe_instruction_step_equipment(instruction_step_id, name)
  values ((:'cascade_step')::uuid, 'grinder')
  returning id as cascade_step_equipment \gset
insert into public.recipe_tags(recipe_id, tag_type, value)
  values ((:'cascade_recipe')::uuid, 'diet', 'Vegetarian')
  returning id as cascade_tag \gset

delete from public.recipes where id = (:'cascade_recipe')::uuid;

select is((select count(*)::int from public.recipe_ingredient_measures where id = (:'cascade_measure')::uuid), 0,
  'cascade deletes recipe_ingredient_measures');
select is((select count(*)::int from public.recipe_nutrients where id = (:'cascade_nutrient')::uuid), 0,
  'cascade deletes recipe_nutrients');
select is((select count(*)::int from public.recipe_nutrition_properties where id = (:'cascade_property')::uuid), 0,
  'cascade deletes recipe_nutrition_properties');
select is((select count(*)::int from public.recipe_flavonoids where id = (:'cascade_flavonoid')::uuid), 0,
  'cascade deletes recipe_flavonoids');
select is((select count(*)::int from public.recipe_nutrition_ingredients where id = (:'cascade_nutrition_ingredient')::uuid), 0,
  'cascade deletes recipe_nutrition_ingredients');
select is((select count(*)::int from public.recipe_nutrition_ingredient_nutrients where id = (:'cascade_nutrition_ingredient_nutrient')::uuid), 0,
  'cascade deletes recipe_nutrition_ingredient_nutrients');
select is((select count(*)::int from public.recipe_instruction_groups where id = (:'cascade_group')::uuid), 0,
  'cascade deletes recipe_instruction_groups');
select is((select count(*)::int from public.recipe_instruction_steps where id = (:'cascade_step')::uuid), 0,
  'cascade deletes recipe_instruction_steps');
select is((select count(*)::int from public.recipe_instruction_step_ingredients where id = (:'cascade_step_ingredient')::uuid), 0,
  'cascade deletes recipe_instruction_step_ingredients');
select is((select count(*)::int from public.recipe_instruction_step_equipment where id = (:'cascade_step_equipment')::uuid), 0,
  'cascade deletes recipe_instruction_step_equipment');
select is((select count(*)::int from public.recipe_tags where id = (:'cascade_tag')::uuid), 0,
  'cascade deletes recipe_tags');

-- ─────────────────────────────────────────────────────────────────────────────
-- recipe_completeness reflects image + ingredient + step + Calories nutrient.
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  (select should_be_complete from public.recipe_completeness where id = (:'complete_recipe')::uuid),
  true,
  'recipe_completeness marks a recipe complete when all required parts exist'
);

select is(
  (select should_be_complete from public.recipe_completeness where id = (:'incomplete_recipe')::uuid),
  false,
  'recipe_completeness marks a recipe incomplete without a Calories nutrient'
);

select * from finish();
rollback;
