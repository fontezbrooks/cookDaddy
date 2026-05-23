-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test.
-- Guarantee: anon role gets zero recipe rows; authed role reads all.
-- RLS policies under test: recipes_auth_read, ri_auth_read (016).

begin;
select plan(4);

-- Seed catalog as service_role.
select tests.seed_recipe('Recipe Alpha') as r1 \gset
select tests.seed_recipe('Recipe Beta')  as r2 \gset
select tests.as_service();
insert into public.recipe_ingredients(recipe_id, name, sort_order)
  values (:'r1'::uuid, 'salt', 0), (:'r2'::uuid, 'pepper', 0);

-- Anon: zero rows everywhere.
select tests.as_anon();
select is_empty(
  $$ select id from public.recipes $$,
  'anon sees zero recipes'
);
select is_empty(
  $$ select id from public.recipe_ingredients $$,
  'anon sees zero recipe_ingredients'
);

-- Authed user: sees all catalog rows (no pod membership required).
select tests.seed_three_users();
select tests.as_user('user_carol');
select is(
  (select count(*)::int from public.recipes),
  2,
  'authed user reads all recipes (catalog is public-to-authed)'
);
select is(
  (select count(*)::int from public.recipe_ingredients),
  2,
  'authed user reads all recipe_ingredients'
);

select * from finish();
rollback;
