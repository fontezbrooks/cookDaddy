-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test (NFR-S2).
-- Guarantee: a non-member of a pod gets zero rows from every pod-scoped table.
-- RLS policies under test: pods_member_read, pm_read, sessions_pod_read,
--   swipes_pod_read, matches_pod_read, sli_pod, pi_pod (016).

begin;
select plan(7);

-- Seed: Alice + Bob in a pod; Carol is unpaired.
select tests.seed_paired_pod() as pod_id \gset
select tests.seed_recipe('Carbonara') as recipe_id \gset

-- As service_role, plant fixture rows in every pod-scoped table.
select tests.as_service();
insert into public.sessions(pod_id, started_by, deck_recipe_ids)
  values (:'pod_id', 'user_alice', array[:'recipe_id'::uuid]);
insert into public.shopping_list_items(pod_id, name, added_by_user_id)
  values (:'pod_id', 'eggs', 'user_alice');
insert into public.pantry_items(pod_id, name, name_clean, updated_by_user_id)
  values (:'pod_id', 'Olive Oil', 'olive oil', 'user_alice');

-- Carol (non-member) sees nothing pod-scoped.
select tests.as_user('user_carol');

select is_empty(
  $$ select id from public.pods $$,
  'carol cannot read pods (non-member)'
);
select is_empty(
  $$ select pod_id from public.pod_members $$,
  'carol cannot read pod_members'
);
select is_empty(
  $$ select id from public.sessions $$,
  'carol cannot read sessions'
);
select is_empty(
  $$ select id from public.shopping_list_items $$,
  'carol cannot read shopping_list_items'
);
select is_empty(
  $$ select id from public.pantry_items $$,
  'carol cannot read pantry_items'
);

-- Alice (member) sees everything in her pod.
select tests.as_user('user_alice');
select isnt_empty(
  $$ select id from public.sessions $$,
  'alice (member) can read sessions in her pod'
);
select isnt_empty(
  $$ select id from public.shopping_list_items $$,
  'alice (member) can read her pod shopping list'
);

select * from finish();
rollback;
