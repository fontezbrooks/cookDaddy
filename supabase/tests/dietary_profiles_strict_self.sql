-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test (NFR-S3 / Decision D-4).
-- Guarantee: partner cannot SELECT their partner's dietary_profiles row.
-- This is the canary for NFR-S3.
-- RLS policy under test: dp_self (016_rls_policies.sql).

begin;
select plan(3);

-- Seed: Alice + Bob paired in a pod, each with a dietary profile.
select tests.seed_paired_pod();

select tests.as_service();
insert into public.dietary_profiles(user_id, hard_exclusions) values
  ('user_alice', array['nut_free']::dietary_hard[]),
  ('user_bob',   array['gluten_free']::dietary_hard[]);

-- Alice can read her own profile.
select tests.as_user('user_alice');
select is(
  (select hard_exclusions from public.dietary_profiles where user_id = 'user_alice'),
  array['nut_free']::dietary_hard[],
  'alice can read her own dietary profile'
);

-- Alice CANNOT read Bob's profile even though they share a pod.
select is_empty(
  $$ select user_id from public.dietary_profiles where user_id = 'user_bob' $$,
  'alice cannot read her pod-partner bob''s dietary profile'
);

-- Alice cannot insert a profile for Bob.
select throws_ok(
  $$ insert into public.dietary_profiles(user_id, hard_exclusions)
     values ('user_bob', array['vegan']::dietary_hard[]) $$,
  '42501',  -- insufficient_privilege from RLS with-check failure
  NULL,
  'alice cannot insert a dietary profile under bob''s user_id'
);

select * from finish();
rollback;
