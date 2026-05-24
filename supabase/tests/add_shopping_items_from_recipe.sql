-- Source: docs/WORKFLOW/README.md §13 (P10-S4).
-- Guarantee: a pod member fans a recipe's selected ingredients onto the shared
-- shopping list in one call (name→name, amount→quantity, aisle→category,
-- source_recipe_id + added_by_user_id set), the call reports pantry conflicts by
-- name_clean, ingredient ids not belonging to the recipe are ignored, and
-- non-members + anon are denied.

begin;
select plan(9);

select tests.seed_paired_pod() as pod \gset
select tests.seed_recipe('Conflict Curry') as recipe \gset
select tests.seed_recipe('Other Recipe') as recipe2 \gset

-- Seed ingredients on the recipe (service role bypasses RLS).
select tests.as_service();
insert into public.recipe_ingredients
  (recipe_id, name, name_clean, original, amount, unit, aisle, sort_order)
values ((:'recipe')::uuid, 'Yellow Onion', 'yellow onion', '1 yellow onion', 1, 'whole', 'Produce', 0)
returning id as ing_onion \gset
insert into public.recipe_ingredients
  (recipe_id, name, name_clean, original, amount, unit, aisle, sort_order)
values ((:'recipe')::uuid, 'Garlic Cloves', 'garlic clove', '3 garlic cloves', 3, 'clove', 'Produce', 1)
returning id as ing_garlic \gset
insert into public.recipe_ingredients
  (recipe_id, name, name_clean, original, amount, unit, aisle, sort_order)
values ((:'recipe')::uuid, 'Coconut Milk', 'coconut milk', '1 can coconut milk', 1, 'can', 'Canned and Jarred', 2)
returning id as ing_coconut \gset
insert into public.recipe_ingredients
  (recipe_id, name, name_clean, original, amount, unit, aisle, sort_order)
values ((:'recipe2')::uuid, 'Foreign Item', 'foreign item', '1 foreign item', 1, 'unit', 'Other', 0)
returning id as ing_foreign \gset

-- Pantry already holds an onion (name_clean matches the recipe ingredient).
insert into public.pantry_items (pod_id, name, name_clean, updated_by_user_id)
values ((:'pod')::uuid, 'Yellow Onions', 'yellow onion', 'user_alice');

-- Alice (member) adds all three recipe ingredients.
select tests.as_user('user_alice');
select public.add_shopping_items_from_recipe(
  (:'pod')::uuid, (:'recipe')::uuid,
  array[(:'ing_onion')::uuid, (:'ing_garlic')::uuid, (:'ing_coconut')::uuid]
) as res \gset

select is((:'res'::jsonb->>'inserted_count')::int, 3, 'inserts all three selected ingredients');
select is(
  (select count(*)::int from public.shopping_list_items where pod_id = (:'pod')::uuid),
  3,
  'three shopping rows now exist for the pod'
);
select is(
  (select concat_ws('|', quantity::text, unit, category, (source_recipe_id = (:'recipe')::uuid)::text, added_by_user_id)
     from public.shopping_list_items
    where pod_id = (:'pod')::uuid and name = 'Yellow Onion'),
  '1|whole|Produce|true|user_alice',
  'onion row maps amount→quantity, aisle→category, source_recipe_id, added_by_user_id'
);
select is(
  jsonb_array_length(:'res'::jsonb->'pantry_conflicts'),
  1,
  'exactly one pantry conflict reported'
);
select is(
  (:'res'::jsonb->'pantry_conflicts'->>0),
  'Yellow Onion',
  'the conflict is the onion (matched by name_clean)'
);

-- Ingredient id belonging to a different recipe is ignored.
select public.add_shopping_items_from_recipe(
  (:'pod')::uuid, (:'recipe')::uuid, array[(:'ing_foreign')::uuid]
) as res2 \gset
select is((:'res2'::jsonb->>'inserted_count')::int, 0, 'cross-recipe ingredient id inserts nothing');
select is(
  (select count(*)::int from public.shopping_list_items where pod_id = (:'pod')::uuid),
  3,
  'shopping rows unchanged after the no-op call'
);

-- Non-member denied.
select tests.as_user('user_carol');
select throws_ok(
  format($$ select public.add_shopping_items_from_recipe(%L::uuid, %L::uuid, array[%L::uuid]) $$,
         :'pod', :'recipe', :'ing_onion'),
  'P0001',
  'not_member',
  'non-member cannot add to another pod''s shopping list'
);

-- Anon has no EXECUTE grant.
select tests.as_anon();
select throws_ok(
  format($$ select public.add_shopping_items_from_recipe(%L::uuid, %L::uuid, array[%L::uuid]) $$,
         :'pod', :'recipe', :'ing_onion'),
  '42501',
  null,
  'anon is denied execute'
);

select * from finish();
rollback;
