begin;
select plan(2);

select tests.seed_three_users();

select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice_

select tests.as_user('user_bob');
select lower(substr(:'alice_token',1,4) || '-' || substr(:'alice_token',5,4)) as typed \gset bob_
select * from public.consume_pod_invite(:'bob_typed') \gset joined_

select is(
  (:'joined_pod_id')::uuid,
  (:'alice_pod_id')::uuid,
  'lowercased+dashed code still joins alice''s pod'
);
select is(
  (:'joined_already_member')::boolean,
  false,
  'first consume of normalized code returns already_member=false'
);

select * from finish();
rollback;
