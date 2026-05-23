-- Source: docs/WORKFLOW/README.md §8 — P5 pod-lifecycle RPC.
-- Guarantee: consume_pod_invite() rejects unknown tokens, the inviter's own
-- token, expired tokens, and callers who are already in a different active
-- pod. Anon callers are blocked by GRANT.

begin;
select plan(5);

select tests.seed_three_users();

-- Unknown token: not_found.
select tests.as_user('user_bob');
select throws_ok(
  $$ select * from public.consume_pod_invite('definitely-not-a-real-token-xxxxxxxxxx') $$,
  'P0001',
  'invite_not_found',
  'unknown token raises invite_not_found'
);

-- Alice creates an invite; alice consuming her own raises.
select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice_

select throws_ok(
  format($$ select * from public.consume_pod_invite(%L) $$, :'alice_token'),
  'P0001',
  'cannot_consume_own_invite',
  'inviter cannot consume their own invite'
);

-- Expired invite raises.
select tests.as_service();
update public.pod_invites
  set expires_at = now() - interval '5 minutes'
  where pod_id = (:'alice_pod_id')::uuid;

select tests.as_user('user_bob');
select throws_ok(
  format($$ select * from public.consume_pod_invite(%L) $$, :'alice_token'),
  'P0001',
  'invite_expired',
  'expired invite raises invite_expired'
);

-- Restore expiry; give bob his own pod; he can't consume alice's now.
select tests.as_service();
update public.pod_invites
  set expires_at = now() + interval '1 hour'
  where pod_id = (:'alice_pod_id')::uuid;
insert into public.pods default values returning id as bob_pod \gset
insert into public.pod_members(pod_id, user_id) values (:'bob_pod', 'user_bob');

select tests.as_user('user_bob');
select throws_ok(
  format($$ select * from public.consume_pod_invite(%L) $$, :'alice_token'),
  'P0001',
  'consumer_already_in_a_pod',
  'consumer already in another active pod cannot consume'
);

-- Anon is blocked by GRANT EXECUTE.
select tests.as_anon();
select throws_ok(
  format($$ select * from public.consume_pod_invite(%L) $$, :'alice_token'),
  NULL, NULL,
  'anon role cannot call consume_pod_invite (permission denied)'
);

select * from finish();
rollback;
