-- Source: docs/WORKFLOW/README.md §8 — P5 pod-lifecycle RPC.
-- Guarantee: consume_pod_invite(token) rejects a link for a dissolved pod.

begin;
select plan(1);

select tests.seed_three_users();

select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice_
select public.dissolve_pod((:'alice_pod_id')::uuid);

select tests.as_user('user_bob');
select throws_ok(
  format($$ select * from public.consume_pod_invite(%L) $$, :'alice_token'),
  'P0001',
  'invite_expired',
  'dissolved pod invite raises invite_expired'
);

select * from finish();
rollback;
