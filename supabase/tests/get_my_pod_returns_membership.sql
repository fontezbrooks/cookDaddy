-- Source: docs/POD-READ-PATH/README.md FR-1 — authoritative membership read.
-- Guarantee: get_my_pod() returns the caller's active pod with the partner and
-- member count inline, via the same auth_user_id() path as the mutation RPCs.
-- Zero rows when unpaired or after dissolution; anon cannot execute.
-- NOTE: privilege checks use has_function_privilege, never an anon throws_ok
-- 42501 probe (that PANICs the local pgTAP runner).

begin;
select plan(11);

select tests.seed_three_users();

-- Unpaired caller sees zero rows.
select tests.as_user('user_alice');
select is(
  (select count(*)::int from public.get_my_pod()),
  0,
  'no active pod → zero rows'
);

-- Solo pod: alice creates an invite (idempotent solo-create).
select * from public.create_pod_invite() \gset alice_

select is(
  (select gp.pod_id from public.get_my_pod() gp),
  (:'alice_pod_id')::uuid,
  'solo: pod_id matches the pod created by create_pod_invite'
);
select ok(
  (select gp.partner_user_id from public.get_my_pod() gp) is null,
  'solo: partner_user_id is null'
);
select is(
  (select gp.member_count from public.get_my_pod() gp),
  1,
  'solo: member_count is 1'
);

-- Paired: bob consumes alice's invite.
select tests.as_user('user_bob');
select * from public.consume_pod_invite(:'alice_token') \gset bob_

select tests.as_user('user_alice');
select is(
  (select gp.partner_user_id from public.get_my_pod() gp),
  'user_bob',
  'paired (alice view): partner is bob'
);
select is(
  (select gp.partner_display_name from public.get_my_pod() gp),
  (select u.display_name from public.users u where u.id = 'user_bob'),
  'paired (alice view): partner_display_name is bob''s display_name'
);
select is(
  (select gp.member_count from public.get_my_pod() gp),
  2,
  'paired: member_count is 2'
);

select tests.as_user('user_bob');
select is(
  (select gp.partner_user_id from public.get_my_pod() gp),
  'user_alice',
  'paired (bob view): partner is alice'
);

-- After dissolution the pod disappears from the read.
select tests.as_user('user_alice');
select public.dissolve_pod((:'alice_pod_id')::uuid);
select is(
  (select count(*)::int from public.get_my_pod()),
  0,
  'after dissolve → zero rows'
);

-- Privileges.
select ok(
  has_function_privilege('authenticated', 'public.get_my_pod()', 'execute'),
  'authenticated can execute get_my_pod'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_pod()', 'execute'),
  'anon cannot execute get_my_pod'
);

select * from finish();
rollback;
