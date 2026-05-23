-- Source: docs/WORKFLOW/README.md §8 — P5 pod-lifecycle RPC.
-- Guarantee: create_pod_invite() on an unpaired user creates a fresh pod with
-- the caller as the sole member, returns a raw token + future expiry, and
-- persists only the HMAC of the token in pod_invites.token_hash. Second call
-- by the same user (now in a pod) raises.

begin;
select plan(7);

select tests.seed_three_users();

-- Alice (no pod yet) calls create_pod_invite()
select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice_

select ok(length(:'alice_token') >= 16, 'token is at least 16 chars');
select ok((:'alice_expires_at')::timestamptz > now(), 'expires in the future');

-- Pod created and alice is the sole member.
select tests.as_service();
select is(
  (select count(*)::int from public.pods where id = (:'alice_pod_id')::uuid and archived_at is null),
  1,
  'alice''s new pod exists and is active'
);
select is(
  (select count(*)::int from public.pod_members where pod_id = (:'alice_pod_id')::uuid),
  1,
  'alice is the only pod_member so far'
);

-- pod_invites row exists, hash stored (raw token is NOT in the table).
select is(
  (select count(*)::int from public.pod_invites
    where pod_id = (:'alice_pod_id')::uuid
      and inviter_user_id = 'user_alice'
      and consumed_at is null),
  1,
  'pod_invite row created for alice with unconsumed hash'
);
select is(
  (select count(*)::int from public.pod_invites where token_hash = :'alice_token'),
  0,
  'raw token is never stored in token_hash column'
);

-- Second call by alice (now in a pod) raises.
select tests.as_user('user_alice');
select throws_ok(
  $$ select * from public.create_pod_invite() $$,
  'P0001',
  'already_in_a_pod',
  'second create_pod_invite by user already in pod raises'
);

select * from finish();
rollback;
