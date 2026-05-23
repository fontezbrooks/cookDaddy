-- Source: docs/WORKFLOW/README.md §9 — P6 swipe-session RPC.
-- Guarantee: start_session(pod_id) creates a lobby-status session with a
-- non-empty deck that excludes recipes either partner has already
-- right-swiped historically.

begin;
select plan(6);

select tests.seed_paired_pod() as pod \gset

-- Seed 3 recipes via the helper.
select tests.seed_recipe('Risotto') as r1 \gset
select tests.seed_recipe('Tacos') as r2 \gset
select tests.seed_recipe('Stir Fry') as r3 \gset

-- Pre-existing right-swipe by alice on r1 in a *different* prior session.
-- Since there's no prior session, we'll fake one purely to anchor the swipe.
select tests.as_service();
insert into public.sessions(pod_id, started_by, status, deck_recipe_ids)
  values (:'pod', 'user_alice', 'ended', array[(:'r1')::uuid])
  returning id as old_session \gset
insert into public.swipes(session_id, pod_id, user_id, recipe_id, direction)
  values (:'old_session', :'pod', 'user_alice', :'r1', 'right');

-- Alice (member) starts a new session.
select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset alice_

-- Assertions.
select ok(length(:'alice_session_id') > 0, 'returns a session_id');
select tests.as_service();
select is(
  (select status from public.sessions where id = (:'alice_session_id')::uuid),
  'lobby'::session_status,
  'session is created in lobby state'
);
select is(
  (select started_by from public.sessions where id = (:'alice_session_id')::uuid),
  'user_alice',
  'started_by is the caller'
);
select is(
  (select coalesce(cardinality(deck_recipe_ids), 0) > 0
     from public.sessions where id = (:'alice_session_id')::uuid),
  true,
  'deck is non-empty'
);
-- Push the array-membership test inside the subquery so we get a scalar
-- boolean back instead of wrestling with `= any(subquery)` interpretation.
select is(
  (select (:'r1')::uuid = any(deck_recipe_ids)
     from public.sessions where id = (:'alice_session_id')::uuid),
  false,
  'deck excludes a recipe alice already right-swiped historically'
);

-- Non-member cannot start a session for someone else's pod.
select tests.as_user('user_carol');
select throws_ok(
  format($$ select * from public.start_session(%L::uuid) $$, :'pod'),
  'P0001',
  'not_member',
  'non-member cannot start a session for that pod'
);

select * from finish();
rollback;
