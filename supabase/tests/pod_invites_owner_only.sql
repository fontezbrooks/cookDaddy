-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test.
-- Guarantee: non-inviter cannot read invite rows (prevents token enumeration).
-- RLS policy under test: invites_owner_read (016).

begin;
select plan(4);

select tests.seed_three_users();

-- Alice creates a pod + invite (server-side / service_role path).
select tests.as_service();
insert into public.pods default values returning id as pod_id \gset
insert into public.pod_members(pod_id, user_id) values (:'pod_id', 'user_alice');
insert into public.pod_invites(pod_id, inviter_user_id, token_hash, expires_at)
  values (:'pod_id', 'user_alice', 'hash_alice_1', now() + interval '24h');

-- Alice (inviter) can read her invite.
select tests.as_user('user_alice');
select is(
  (select count(*)::int from public.pod_invites where inviter_user_id = 'user_alice'),
  1,
  'inviter alice can read her own invite'
);

-- Bob — even if he's the intended recipient — cannot read the invite by browsing the table.
-- He learns the token via the share link, never by enumerating pod_invites.
select tests.as_user('user_bob');
select is_empty(
  $$ select id from public.pod_invites $$,
  'non-inviter bob sees zero invites (no token enumeration)'
);

-- Carol (uninvolved) also sees nothing.
select tests.as_user('user_carol');
select is_empty(
  $$ select id from public.pod_invites $$,
  'uninvolved user carol sees zero invites'
);

-- Anon sees nothing.
select tests.as_anon();
select is_empty(
  $$ select id from public.pod_invites $$,
  'anon sees zero invites'
);

select * from finish();
rollback;
