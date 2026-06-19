-- Source: docs/WORKFLOW/README.md §8 — P5 pod-lifecycle RPC.
-- Guarantee: consume_pod_invite(token) rejects a live invite when the target
-- pod already has two members.

begin;
select plan(1);

select tests.seed_three_users();

select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice_

select tests.as_user('user_bob');
select * from public.consume_pod_invite(:'alice_token') \gset bob_

select tests.as_service();
insert into public.pod_invites(pod_id, inviter_user_id, token_hash, expires_at)
values (
  (:'alice_pod_id')::uuid,
  'user_alice',
  public.hash_invite_token('carol-token'),
  now() + interval '24 hours'
);

select tests.as_user('user_carol');
select throws_ok(
  $$ select * from public.consume_pod_invite('carol-token') $$,
  'P0001',
  'pod_full',
  'third user cannot consume a live invite for a full pod'
);

select * from finish();
rollback;
