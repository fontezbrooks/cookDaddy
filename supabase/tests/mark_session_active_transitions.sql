-- Source: docs/WORKFLOW/README.md §9 — P6 swipe-session RPC.
-- Guarantee: mark_session_active(session_id) flips lobby → active for pod
-- members only; calling on an already-active session is idempotent; calling
-- on an ended session raises.

begin;
select plan(4);

select tests.seed_paired_pod() as pod \gset
select tests.seed_recipe('R') as r \gset

select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset alice_

-- Alice (member) can transition.
select lives_ok(
  format($$ select public.mark_session_active(%L::uuid) $$, :'alice_session_id'),
  'member can transition lobby → active'
);
select tests.as_service();
select is(
  (select status from public.sessions where id = (:'alice_session_id')::uuid),
  'active'::session_status,
  'status is now active'
);

-- Second call by either member is a no-op (idempotent).
select tests.as_user('user_bob');
select lives_ok(
  format($$ select public.mark_session_active(%L::uuid) $$, :'alice_session_id'),
  'second call on an already-active session is a no-op'
);

-- Ended sessions cannot be reactivated.
select tests.as_service();
update public.sessions set status = 'ended', ended_at = now(), ended_reason = 'user_ended'
  where id = (:'alice_session_id')::uuid;
select tests.as_user('user_alice');
select throws_ok(
  format($$ select public.mark_session_active(%L::uuid) $$, :'alice_session_id'),
  'P0001',
  'session_not_pending',
  'ended sessions cannot be reactivated'
);

select * from finish();
rollback;
