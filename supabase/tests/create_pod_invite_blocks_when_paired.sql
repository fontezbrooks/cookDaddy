-- Source: docs/WORKFLOW/README.md §8 — P5 pod-lifecycle RPC.
-- Guarantee: create_pod_invite() still rejects callers in a genuinely paired
-- active pod.

begin;
select plan(1);

select tests.seed_three_users();

select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice_

select tests.as_user('user_bob');
select * from public.consume_pod_invite(:'alice_token') \gset bob_

select tests.as_user('user_alice');
select throws_ok(
  $$ select * from public.create_pod_invite() $$,
  'P0001',
  'already_in_a_pod',
  'paired user cannot create another pod invite'
);

select * from finish();
rollback;
