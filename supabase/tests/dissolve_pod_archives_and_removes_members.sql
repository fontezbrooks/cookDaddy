-- Source: docs/WORKFLOW/README.md §8 — P5 pod-lifecycle RPC.
-- Guarantee: dissolve_pod(pod_id) sets pods.archived_at, deletes both
-- pod_members rows (so the partner-removed-me detection in the mobile app
-- works), only members can call it, and after dissolution either partner can
-- create a brand-new pod. Pending invites are expired when the pod dissolves.

begin;
select plan(7);

select tests.seed_paired_pod() as pod \gset

select tests.as_service();
insert into public.pod_invites(pod_id, inviter_user_id, token_hash, expires_at)
values ((:'pod')::uuid, 'user_alice', public.hash_invite_token('pending-dissolve-token'), now() + interval '1 hour');

-- Non-member cannot dissolve.
select tests.as_user('user_carol');
select throws_ok(
  format($$ select public.dissolve_pod(%L::uuid) $$, :'pod'),
  'P0001',
  'not_member',
  'non-member cannot dissolve a pod'
);

-- Alice (member) can dissolve.
select tests.as_user('user_alice');
select lives_ok(
  format($$ select public.dissolve_pod(%L::uuid) $$, :'pod'),
  'member can dissolve their own pod'
);

-- pods.archived_at is set.
select tests.as_service();
select isnt(
  (select archived_at from public.pods where id = (:'pod')::uuid),
  NULL,
  'pods.archived_at is set after dissolution'
);

-- pod_members rows for that pod are gone.
select is(
  (select count(*)::int from public.pod_members where pod_id = (:'pod')::uuid),
  0,
  'all pod_members rows deleted (enables partner-removed-me detection)'
);

select is(
  (select count(*)::int from public.pod_invites
    where pod_id = (:'pod')::uuid
      and consumed_at is null
      and expires_at > now()),
  0,
  'pending invites for the dissolved pod are expired'
);

-- Alice can create a new pod after dissolution.
select tests.as_user('user_alice');
select * from public.create_pod_invite() \gset alice2_

select is(
  (select count(*)::int from public.pods where id = (:'alice2_pod_id')::uuid and archived_at is null),
  1,
  'alice can create a new active pod after dissolution'
);
select is(
  (select count(*)::int
     from public.pod_members pm
     join public.pods p on p.id = pm.pod_id
    where pm.user_id = 'user_alice' and p.archived_at is null),
  1,
  'alice belongs to exactly one active pod (the new one)'
);

select * from finish();
rollback;
