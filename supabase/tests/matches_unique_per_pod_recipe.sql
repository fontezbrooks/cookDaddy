-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test (NFR-R2 / D-2).
-- Guarantee: second match insert for the same (pod_id, recipe_id) returns no row under
-- `on conflict do nothing`. The unique constraint is the exactly-once backstop.
-- Schema under test: matches.unique(pod_id, recipe_id) (009_matches.sql).

begin;
select plan(3);

select tests.seed_paired_pod() as pod_id \gset
select tests.seed_recipe('Tikka Masala') as recipe_id \gset

select tests.as_service();
insert into public.sessions(pod_id, started_by, status, deck_recipe_ids)
  values (:'pod_id', 'user_alice', 'active', array[:'recipe_id'::uuid])
  returning id as session_id \gset

-- First match insert: row materializes.
with ins as (
  insert into public.matches(pod_id, recipe_id, session_id)
  values (:'pod_id', :'recipe_id', :'session_id')
  on conflict (pod_id, recipe_id) do nothing
  returning id
)
select is((select count(*)::int from ins), 1, 'first match insert returns a row');

-- Second match insert with same (pod_id, recipe_id): on-conflict swallows it, RETURNING is empty.
with ins as (
  insert into public.matches(pod_id, recipe_id, session_id)
  values (:'pod_id', :'recipe_id', :'session_id')
  on conflict (pod_id, recipe_id) do nothing
  returning id
)
select is((select count(*)::int from ins), 0, 'second match insert returns no row');

-- Final state: exactly one match row for this (pod, recipe).
select is(
  (select count(*)::int from public.matches where pod_id = :'pod_id' and recipe_id = :'recipe_id'),
  1,
  'exactly one match row exists for the (pod, recipe) pair'
);

select * from finish();
rollback;
