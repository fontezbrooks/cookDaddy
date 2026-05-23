-- Source: docs/DESIGN/README.md §7 — submit_swipe match detection.
-- Guarantee: a right-swipe by partner A returns match=false; a subsequent
-- right-swipe by partner B on the same recipe returns match=true and
-- creates exactly one matches row (the FOR UPDATE on sessions serializes
-- the race; the unique constraint on matches is the backstop).

begin;
select plan(6);

select tests.seed_paired_pod() as pod \gset
select tests.seed_recipe('Risotto') as recipe \gset

-- Start + activate.
select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset s_
select public.mark_session_active((:'s_session_id')::uuid);

-- Alice right-swipes first.
select * from public.submit_swipe(
  (:'s_session_id')::uuid,
  (:'recipe')::uuid,
  'right'::swipe_direction
) \gset alice_swipe_

select is(
  (:'alice_swipe_match')::boolean, false,
  'first right-swipe by alice → match=false'
);

-- Bob right-swipes the same recipe.
select tests.as_user('user_bob');
select * from public.submit_swipe(
  (:'s_session_id')::uuid,
  (:'recipe')::uuid,
  'right'::swipe_direction
) \gset bob_swipe_

select is(
  (:'bob_swipe_match')::boolean, true,
  'second right-swipe (partner) → match=true'
);
select ok(length(:'bob_swipe_match_id') > 0, 'returns a non-empty match_id');

-- Exactly one matches row exists.
select tests.as_service();
select is(
  (select count(*)::int from public.matches where pod_id = (:'pod')::uuid),
  1,
  'exactly one match row was inserted'
);
select is(
  (select session_id from public.matches where pod_id = (:'pod')::uuid),
  (:'s_session_id')::uuid,
  'match references the session it occurred in'
);

-- Re-right-swiping after the match returns already_matched=true (not a new match).
select tests.as_user('user_bob');
select * from public.submit_swipe(
  (:'s_session_id')::uuid,
  (:'recipe')::uuid,
  'right'::swipe_direction
) \gset bob2_

select is(
  (:'bob2_already_matched')::boolean, true,
  'subsequent right-swipe on an already-matched recipe surfaces already_matched=true'
);

select * from finish();
rollback;
