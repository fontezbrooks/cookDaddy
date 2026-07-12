-- Source: docs/POD-READ-PATH/README.md follow-up (migration 028).
-- Guarantee: get_session(p_session_id) returns the session + pod_created_at
-- for members of the session's pod via the definer path; zero rows for
-- non-members and unknown ids (no session-id probing); anon cannot execute.
-- NOTE: privilege checks use has_function_privilege, never an anon throws_ok
-- 42501 probe (that PANICs the local pgTAP runner).

begin;
select plan(9);

select tests.seed_paired_pod() as pod \gset

select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset s_

select is(
  (select count(*)::int from public.get_session((:'s_session_id')::uuid)),
  1,
  'starter can read the session'
);
select is(
  (select gs.pod_id from public.get_session((:'s_session_id')::uuid) gs),
  (:'pod')::uuid,
  'pod_id matches'
);
select is(
  (select gs.status from public.get_session((:'s_session_id')::uuid) gs),
  'lobby',
  'fresh session is in lobby'
);
select ok(
  (select gs.pod_created_at from public.get_session((:'s_session_id')::uuid) gs) is not null,
  'pod_created_at arrives inline'
);

-- The partner can read it too.
select tests.as_user('user_bob');
select is(
  (select count(*)::int from public.get_session((:'s_session_id')::uuid)),
  1,
  'partner can read the session'
);

-- A non-member sees zero rows — indistinguishable from a missing session.
select tests.as_user('user_carol');
select is(
  (select count(*)::int from public.get_session((:'s_session_id')::uuid)),
  0,
  'non-member gets zero rows'
);

-- Unknown id → zero rows.
select tests.as_user('user_alice');
select is(
  (select count(*)::int from public.get_session('00000000-0000-0000-0000-000000000000'::uuid)),
  0,
  'unknown session id gets zero rows'
);

-- Privileges.
select ok(
  has_function_privilege('authenticated', 'public.get_session(uuid)', 'execute'),
  'authenticated can execute get_session'
);
select ok(
  not has_function_privilege('anon', 'public.get_session(uuid)', 'execute'),
  'anon cannot execute get_session'
);

select * from finish();
rollback;
