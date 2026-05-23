-- Source: docs/WORKFLOW/README.md §4 — required pgTAP test.
-- Guarantee: an authenticated user can UPDATE their own users row, but not another user's row.
-- RLS policy under test: users_self_update (016_rls_policies.sql).

begin;
select plan(5);

select tests.seed_three_users();

-- Alice can update her own display name.
select tests.as_user('user_alice');
update public.users set display_name = 'Alice Renamed' where id = 'user_alice';
select is(
  (select display_name from public.users where id = 'user_alice'),
  'Alice Renamed',
  'alice can rename herself'
);

-- Alice cannot update Bob's row — RLS silently filters him out of the UPDATE target set.
-- The UPDATE statement returns successfully but affects zero rows.
with upd as (
  update public.users set display_name = 'Hacked' where id = 'user_bob' returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'alice''s attempted update of bob affects 0 rows (RLS filters)'
);

-- Verify with a service-role re-read that bob still has his original name.
select tests.as_service();
select is(
  (select display_name from public.users where id = 'user_bob'),
  'Bob',
  'bob''s display_name is unchanged after alice''s attempted update'
);

-- Anon: zero rows visible, UPDATE silently affects zero rows (no policy grants UPDATE to anon).
select tests.as_anon();
select is_empty(
  $$ select id from public.users $$,
  'anon sees zero users'
);
with upd as (
  update public.users set display_name = 'Anon-set' where id = 'user_alice' returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'anon''s attempted update affects 0 rows'
);

select * from finish();
rollback;
