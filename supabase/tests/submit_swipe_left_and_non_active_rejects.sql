-- Source: docs/DESIGN/README.md §7 — submit_swipe boundary cases.
-- Guarantee: left-swipes never match; sessions that are not 'active' refuse
-- swipes; non-members cannot swipe in a pod's session; same-user double
-- right-swipe is idempotent and never produces a self-match.

begin;
select plan(5);

select tests.seed_paired_pod() as pod \gset
select tests.seed_recipe('R') as recipe \gset

-- Lobby session refuses swipes.
select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset s_

select throws_ok(
  format(
    $$ select * from public.submit_swipe(%L::uuid, %L::uuid, 'right'::swipe_direction) $$,
    :'s_session_id', :'recipe'
  ),
  'P0001',
  'session_not_active',
  'lobby session refuses swipes'
);

-- Activate, then left-swipe never matches even when partner right-swipes.
select public.mark_session_active((:'s_session_id')::uuid);

select tests.as_user('user_alice');
select * from public.submit_swipe(
  (:'s_session_id')::uuid, (:'recipe')::uuid, 'left'::swipe_direction
) \gset alice_left_
select is(
  (:'alice_left_match')::boolean, false,
  'left-swipe alone returns match=false'
);

select tests.as_user('user_bob');
select * from public.submit_swipe(
  (:'s_session_id')::uuid, (:'recipe')::uuid, 'right'::swipe_direction
) \gset bob_right_
select is(
  (:'bob_right_match')::boolean, false,
  'partner right-swipe on left-swiped recipe → no match'
);

-- Same-user double right-swipe is idempotent (unique constraint) and never self-matches.
select * from public.submit_swipe(
  (:'s_session_id')::uuid, (:'recipe')::uuid, 'right'::swipe_direction
) \gset bob_again_
select is(
  (:'bob_again_match')::boolean, false,
  'same-user duplicate right-swipe never produces a self-match'
);

-- Non-member cannot swipe in someone else's session.
select tests.as_user('user_carol');
select throws_ok(
  format(
    $$ select * from public.submit_swipe(%L::uuid, %L::uuid, 'right'::swipe_direction) $$,
    :'s_session_id', :'recipe'
  ),
  'P0001',
  'forbidden',
  'non-member cannot swipe in another pod''s session'
);

select * from finish();
rollback;
