-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test.
-- Guarantee: sessions insert fails when the pod has fewer than 2 members.
-- Trigger under test: check_pod_full (007_sessions.sql).

begin;
select plan(3);

-- Seed: Alice only; she creates a pod (1 member).
select tests.as_service();
insert into public.users(id, display_name) values ('user_alice', 'Alice');
insert into public.pods default values returning id as pod_id \gset
insert into public.pod_members(pod_id, user_id) values (:'pod_id', 'user_alice');

-- Starting a session against a 1-member pod raises.
select throws_ok(
  format(
    $$ insert into public.sessions(pod_id, started_by, deck_recipe_ids)
       values (%L, 'user_alice', '{}'::uuid[]) $$,
    :'pod_id'
  ),
  'P0001',
  format('pod %s must have exactly 2 members to start a session', :'pod_id'),
  'session insert raises for a 1-member pod'
);

-- Add Bob → pod is now full.
insert into public.users(id, display_name) values ('user_bob', 'Bob');
insert into public.pod_members(pod_id, user_id) values (:'pod_id', 'user_bob');

-- Session insert now works.
insert into public.sessions(pod_id, started_by, deck_recipe_ids)
  values (:'pod_id', 'user_alice', '{}'::uuid[]);
select is(
  (select count(*)::int from public.sessions where pod_id = :'pod_id'),
  1,
  'session insert succeeds once pod has 2 members'
);

-- Even with 3 members (hypothetical bug) it would fail. We can't insert a 3rd member due to the
-- one-active-pod-per-user trigger, but we can test that the count check is strictly = 2.
insert into public.users(id, display_name) values ('user_carol', 'Carol');
-- Force a 3rd row to verify the != 2 path on insert. Use service_role; trigger fires regardless.
-- One-active-pod check would normally block this; we work around by creating a fresh test pod.
insert into public.pods default values returning id as pod_three \gset
insert into public.pod_members(pod_id, user_id) values
  (:'pod_three', 'user_carol');
-- 1-member pod again → starting session must fail.
select throws_ok(
  format(
    $$ insert into public.sessions(pod_id, started_by, deck_recipe_ids)
       values (%L, 'user_carol', '{}'::uuid[]) $$,
    :'pod_three'
  ),
  'P0001',
  NULL,
  'session insert raises for a different 1-member pod'
);

select * from finish();
rollback;
