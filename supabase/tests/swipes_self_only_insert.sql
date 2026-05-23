-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test.
-- Guarantee: INSERT INTO swipes(user_id = other_user) fails under RLS.
-- RLS policy under test: swipes_self_insert (016_rls_policies.sql).

begin;
select plan(3);

select tests.seed_paired_pod() as pod_id \gset
select tests.seed_recipe('Pad Thai') as recipe_id \gset

-- Build an active session as service_role.
select tests.as_service();
insert into public.sessions(pod_id, started_by, status, deck_recipe_ids)
  values (:'pod_id', 'user_alice', 'active', array[:'recipe_id'::uuid])
  returning id as session_id \gset

-- Alice inserting a swipe as herself is allowed.
select tests.as_user('user_alice');
insert into public.swipes(session_id, pod_id, user_id, recipe_id, direction)
  values (:'session_id', :'pod_id', 'user_alice', :'recipe_id', 'right');
select is(
  (select count(*)::int from public.swipes where user_id = 'user_alice'),
  1,
  'alice can insert her own swipe'
);

-- Alice inserting a swipe with user_id = bob is rejected by RLS with-check.
select throws_ok(
  format(
    $$ insert into public.swipes(session_id, pod_id, user_id, recipe_id, direction)
       values (%L, %L, 'user_bob', %L, 'right') $$,
    :'session_id', :'pod_id', :'recipe_id'
  ),
  '42501',
  NULL,
  'alice cannot insert a swipe as bob'
);

-- A non-member (Carol) cannot insert into the pod's session either.
select tests.as_user('user_carol');
select throws_ok(
  format(
    $$ insert into public.swipes(session_id, pod_id, user_id, recipe_id, direction)
       values (%L, %L, 'user_carol', %L, 'right') $$,
    :'session_id', :'pod_id', :'recipe_id'
  ),
  '42501',
  NULL,
  'non-member cannot insert a swipe into another pod''s session'
);

select * from finish();
rollback;
