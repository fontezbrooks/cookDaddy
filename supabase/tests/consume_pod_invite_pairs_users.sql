-- Source: docs/WORKFLOW/README.md §8 — P5 pod-lifecycle RPC.
-- Guarantee: consume_pod_invite(token) drops the consumer into the inviter's
-- pod, marks the invite consumed, re-tap by the same consumer is idempotent
-- (already_member=true), and a third party cannot consume an already-used
-- invite.

begin;
select plan(7);

select tests.seed_three_users();

-- Alice creates an invite (gets the raw token).
select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice_

-- Bob consumes it.
select tests.as_user('user_bob');
select * from public.consume_pod_invite(:'alice_token') \gset bob_

select is(
  (:'bob_pod_id')::uuid,
  (:'alice_pod_id')::uuid,
  'bob lands in alice''s pod'
);
select is(
  (:'bob_already_member')::boolean,
  false,
  'first consume returns already_member=false'
);

-- pod_members has both partners now.
select tests.as_service();
select is(
  (select count(*)::int from public.pod_members where pod_id = (:'alice_pod_id')::uuid),
  2,
  'two members in the pod after consume'
);

-- Invite is marked consumed by bob.
select is(
  (select consumed_by from public.pod_invites where pod_id = (:'alice_pod_id')::uuid),
  'user_bob',
  'invite.consumed_by = user_bob'
);
select isnt(
  (select consumed_at from public.pod_invites where pod_id = (:'alice_pod_id')::uuid),
  NULL,
  'invite.consumed_at is set'
);

-- Re-tap by bob (already in this pod) is idempotent — returns already_member=true.
select tests.as_user('user_bob');
select * from public.consume_pod_invite(:'alice_token') \gset bob2_
select is(
  (:'bob2_already_member')::boolean,
  true,
  're-tap by same consumer returns already_member=true'
);

-- Carol (third party) trying to consume the already-used invite raises.
select tests.as_user('user_carol');
select throws_ok(
  format($$ select * from public.consume_pod_invite(%L) $$, :'alice_token'),
  'P0001',
  'invite_already_consumed',
  'third party cannot consume already-consumed invite'
);

select * from finish();
rollback;
