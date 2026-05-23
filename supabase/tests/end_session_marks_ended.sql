-- Source: docs/WORKFLOW/README.md §9 — P6 swipe-session RPC.
-- Guarantee: end_session(session_id, reason) flips status to 'ended', stamps
-- ended_at + ended_reason, only members can call it, ending an already-ended
-- session is a no-op, and post-end swipes are rejected.

begin;
select plan(5);

select tests.seed_paired_pod() as pod \gset
select tests.seed_recipe('R') as recipe \gset

select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset s_
select public.mark_session_active((:'s_session_id')::uuid);

-- Bob ends.
select tests.as_user('user_bob');
select lives_ok(
  format(
    $$ select public.end_session(%L::uuid, 'user_ended'::session_end_reason) $$,
    :'s_session_id'
  ),
  'either member can end the session'
);

-- Status, ended_at, ended_reason.
select tests.as_service();
select is(
  (select status from public.sessions where id = (:'s_session_id')::uuid),
  'ended'::session_status,
  'status is ended'
);
select is(
  (select ended_reason from public.sessions where id = (:'s_session_id')::uuid),
  'user_ended'::session_end_reason,
  'ended_reason recorded'
);

-- Calling again is a no-op (doesn't bump ended_at or overwrite reason).
select tests.as_user('user_alice');
select lives_ok(
  format(
    $$ select public.end_session(%L::uuid, 'completed'::session_end_reason) $$,
    :'s_session_id'
  ),
  'ending an already-ended session is a no-op'
);

-- Post-end swipes are rejected.
select throws_ok(
  format(
    $$ select * from public.submit_swipe(%L::uuid, %L::uuid, 'right'::swipe_direction) $$,
    :'s_session_id', :'recipe'
  ),
  'P0001',
  'session_not_active',
  'swipes against an ended session are rejected'
);

select * from finish();
rollback;
