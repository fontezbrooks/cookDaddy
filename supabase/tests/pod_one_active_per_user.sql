-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test.
-- Guarantee: a second insert into pod_members for an already-paired user raises.
-- Trigger under test: check_one_active_pod (004_pods_and_members.sql).

begin;
select plan(3);

-- Seed: Alice + Bob in pod 1; Carol unpaired; a separate empty pod 2.
select tests.seed_paired_pod() as pod_one \gset

select tests.as_service();
insert into public.pods default values returning id as pod_two \gset

-- Inserting Alice into a second pod raises P0001 from the trigger.
select throws_ok(
  format($$ insert into public.pod_members(pod_id, user_id) values (%L, 'user_alice') $$, :'pod_two'),
  'P0001',
  'user user_alice already belongs to an active pod',
  'second pod_members insert for an already-active user raises'
);

-- Carol joining her FIRST pod works.
insert into public.pod_members(pod_id, user_id) values (:'pod_two', 'user_carol');
select is(
  (select count(*)::int from public.pod_members where user_id = 'user_carol'),
  1,
  'carol can join a pod (her first)'
);

-- If pod 1 is archived, Alice can join a new pod.
update public.pods set archived_at = now() where id = :'pod_one';
insert into public.pods default values returning id as pod_three \gset
insert into public.pod_members(pod_id, user_id) values (:'pod_three', 'user_alice');
select is(
  (select count(*)::int from public.pod_members where user_id = 'user_alice' and pod_id = :'pod_three'),
  1,
  'after dissolution alice can join a new pod'
);

select * from finish();
rollback;
