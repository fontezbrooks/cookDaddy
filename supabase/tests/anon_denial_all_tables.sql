-- Source: docs/WORKFLOW/README.md §5 — required pgTAP test for Phase 2.
-- Guarantee: an unauthenticated request gets denied (zero rows / no insert) by
-- RLS on EVERY pod-scoped table. This is the canary that auth must work for the
-- mobile app to do anything meaningful.
--
-- Tables under test: pods, pod_members, pod_invites, sessions, swipes, matches,
--   recipe_ratings, recipe_notes, shopping_list_items, pantry_items, push_tokens,
--   dietary_profiles, users, recipe_ingredient_measures, recipe_nutrients,
--   recipe_nutrition_properties, recipe_flavonoids, recipe_nutrition_ingredients,
--   recipe_nutrition_ingredient_nutrients, recipe_instruction_groups,
--   recipe_instruction_steps, recipe_instruction_step_ingredients,
--   recipe_instruction_step_equipment, recipe_tags.

begin;
select plan(25);

-- Seed fixtures as service_role: a paired pod with a session and one of every kind of row.
select tests.seed_paired_pod() as pod_id \gset
select tests.seed_recipe('Tartiflette') as recipe_id \gset

select tests.as_service();

insert into public.sessions(pod_id, started_by, status, deck_recipe_ids)
  values (:'pod_id', 'user_alice', 'active', array[:'recipe_id'::uuid])
  returning id as session_id \gset

insert into public.swipes(session_id, pod_id, user_id, recipe_id, direction)
  values (:'session_id', :'pod_id', 'user_alice', :'recipe_id', 'right');

insert into public.matches(pod_id, recipe_id, session_id)
  values (:'pod_id', :'recipe_id', :'session_id');

insert into public.recipe_ratings(pod_id, recipe_id, user_id, stars)
  values (:'pod_id', :'recipe_id', 'user_alice', 5);

insert into public.recipe_notes(pod_id, recipe_id, body, last_edited_by)
  values (:'pod_id', :'recipe_id', 'wins again', 'user_alice');

insert into public.shopping_list_items(pod_id, name, added_by_user_id)
  values (:'pod_id', 'salt', 'user_alice');

insert into public.pantry_items(pod_id, name, name_clean, updated_by_user_id)
  values (:'pod_id', 'Olive Oil', 'olive oil', 'user_alice');

insert into public.dietary_profiles(user_id, hard_exclusions)
  values ('user_alice', array['nut_free']::dietary_hard[]);

insert into public.pod_invites(pod_id, inviter_user_id, token_hash, expires_at)
  values (:'pod_id', 'user_alice', 'hash_alice_anon', now() + interval '24h');

insert into public.push_tokens(user_id, expo_token, platform)
  values ('user_alice', 'ExponentPushToken[abc]', 'ios');

insert into public.recipe_ingredients(recipe_id, name, sort_order)
  values (:'recipe_id', 'salt', 0)
  returning id as ingredient_id \gset

insert into public.recipe_ingredient_measures(recipe_ingredient_id, system, amount, unit_short, unit_long)
  values (:'ingredient_id', 'us', 1, 'tsp', 'teaspoon');

insert into public.recipe_nutrients(recipe_id, name, amount, unit, percent_of_daily_needs)
  values (:'recipe_id', 'Calories', 120, 'kcal', 6);

insert into public.recipe_nutrition_properties(recipe_id, name, amount, unit)
  values (:'recipe_id', 'Glycemic Index', 12, '');

insert into public.recipe_flavonoids(recipe_id, name, amount, unit)
  values (:'recipe_id', 'Cyanidin', 0.5, 'mg');

insert into public.recipe_nutrition_ingredients(recipe_id, spoonacular_ingredient_id, name, amount, unit, sort_order)
  values (:'recipe_id', 1001, 'salt', 1, 'tsp', 0)
  returning id as nutrition_ingredient_id \gset

insert into public.recipe_nutrition_ingredient_nutrients(
  recipe_nutrition_ingredient_id, name, amount, unit, percent_of_daily_needs
)
  values (:'nutrition_ingredient_id', 'Sodium', 300, 'mg', 13);

insert into public.recipe_instruction_groups(recipe_id, name, sort_order)
  values (:'recipe_id', 'Main', 0)
  returning id as instruction_group_id \gset

insert into public.recipe_instruction_steps(instruction_group_id, step_number, step_text, sort_order)
  values (:'instruction_group_id', 1, 'Season the dish.', 0)
  returning id as instruction_step_id \gset

insert into public.recipe_instruction_step_ingredients(instruction_step_id, name)
  values (:'instruction_step_id', 'salt');

insert into public.recipe_instruction_step_equipment(instruction_step_id, name)
  values (:'instruction_step_id', 'bowl');

insert into public.recipe_tags(recipe_id, tag_type, value)
  values (:'recipe_id', 'cuisine', 'French');

-- ─── ANON ── now switch to anon role with empty JWT claims and assert no reads.
select tests.as_anon();

select is_empty($$ select id from public.users                 $$, 'anon: zero users');
select is_empty($$ select user_id from public.dietary_profiles $$, 'anon: zero dietary_profiles');
select is_empty($$ select id from public.pods                  $$, 'anon: zero pods');
select is_empty($$ select pod_id from public.pod_members       $$, 'anon: zero pod_members');
select is_empty($$ select id from public.pod_invites           $$, 'anon: zero pod_invites');
select is_empty($$ select id from public.sessions              $$, 'anon: zero sessions');
select is_empty($$ select id from public.swipes                $$, 'anon: zero swipes');
select is_empty($$ select id from public.matches               $$, 'anon: zero matches');
select is_empty($$ select user_id from public.recipe_ratings   $$, 'anon: zero recipe_ratings');
select is_empty($$ select pod_id from public.recipe_notes      $$, 'anon: zero recipe_notes');
select is_empty($$ select id from public.shopping_list_items   $$, 'anon: zero shopping_list_items');
select is_empty($$ select id from public.pantry_items          $$, 'anon: zero pantry_items');
select is_empty($$ select expo_token from public.push_tokens   $$, 'anon: zero push_tokens');
select is_empty($$ select id from public.recipe_ingredient_measures             $$, 'anon: zero recipe_ingredient_measures');
select is_empty($$ select id from public.recipe_nutrients                       $$, 'anon: zero recipe_nutrients');
select is_empty($$ select id from public.recipe_nutrition_properties            $$, 'anon: zero recipe_nutrition_properties');
select is_empty($$ select id from public.recipe_flavonoids                      $$, 'anon: zero recipe_flavonoids');
select is_empty($$ select id from public.recipe_nutrition_ingredients           $$, 'anon: zero recipe_nutrition_ingredients');
select is_empty($$ select id from public.recipe_nutrition_ingredient_nutrients  $$, 'anon: zero recipe_nutrition_ingredient_nutrients');
select is_empty($$ select id from public.recipe_instruction_groups              $$, 'anon: zero recipe_instruction_groups');
select is_empty($$ select id from public.recipe_instruction_steps               $$, 'anon: zero recipe_instruction_steps');
select is_empty($$ select id from public.recipe_instruction_step_ingredients    $$, 'anon: zero recipe_instruction_step_ingredients');
select is_empty($$ select id from public.recipe_instruction_step_equipment      $$, 'anon: zero recipe_instruction_step_equipment');
select is_empty($$ select id from public.recipe_tags                            $$, 'anon: zero recipe_tags');

-- Anon insert is also blocked (no policy grants INSERT to anon).
select throws_ok(
  $$ insert into public.shopping_list_items(pod_id, name, added_by_user_id)
     values (gen_random_uuid(), 'eggs', 'user_alice') $$,
  '42501',
  NULL,
  'anon: insert into shopping_list_items raises insufficient_privilege'
);

select * from finish();
rollback;
