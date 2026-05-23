-- Source: docs/DESIGN/README.md §3.5 + docs/WORKFLOW/README.md §10 (P7).
-- RLS re-verify sweep for swipes + matches now that the P6 RPC layer is
-- live. Existing tests cover:
--   • swipes_self_only_insert.sql — own-row insert + alien insert deny
--   • matches_unique_per_pod_recipe.sql — schema unique backstop
--
-- This file closes the remaining gaps for READ, UPDATE, anon, and
-- cross-pod isolation:
--   • pod members can READ each other's swipes (partner mirror UX)
--   • non-members CANNOT read swipes (forbidden)
--   • anon CANNOT touch swipes at all
--   • pod members can READ matches (cookbook surface)
--   • pod members can UPDATE matches (mark cooked / soft-delete)
--   • non-members CANNOT read or update matches
--   • anon CANNOT touch matches at all
--   • client-side direct INSERT on matches is blocked (only submit_swipe
--     can insert — there's no insert policy in 016_rls_policies.sql)
--   • cross-pod isolation: a user in pod-2 cannot read pod-1's swipes/matches

begin;
select plan(14);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures: paired pod (Alice + Bob) + a separate pod (Carol + Dave).
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_paired_pod() as pod1 \gset
select tests.seed_recipe('RLS Carbonara') as recipe \gset

-- Second pod with two different users. seed_three_users() already exists;
-- we extend it with Dave directly via service_role.
select tests.as_service();
insert into public.users(id, display_name)
  values ('user_dave', 'Dave')
  on conflict (id) do nothing;

insert into public.pods default values returning id as pod2 \gset
insert into public.pod_members(pod_id, user_id) values
  ((:'pod2')::uuid, 'user_carol'),
  ((:'pod2')::uuid, 'user_dave');

-- Pre-seed: an active session in pod1, swipes from both partners, and a
-- match row. This is the schema state we expect after a successful
-- submit_swipe round-trip.
insert into public.sessions(pod_id, started_by, status, deck_recipe_ids)
  values ((:'pod1')::uuid, 'user_alice', 'active', array[(:'recipe')::uuid])
  returning id as session_id \gset

insert into public.swipes(session_id, pod_id, user_id, recipe_id, direction)
  values
    ((:'session_id')::uuid, (:'pod1')::uuid, 'user_alice', (:'recipe')::uuid, 'right'),
    ((:'session_id')::uuid, (:'pod1')::uuid, 'user_bob',   (:'recipe')::uuid, 'right');

insert into public.matches(pod_id, recipe_id, session_id)
  values ((:'pod1')::uuid, (:'recipe')::uuid, (:'session_id')::uuid)
  returning id as match_id \gset

-- ─────────────────────────────────────────────────────────────────────────────
-- SWIPES — read policy: pod members can read both their own and the
-- partner's swipes. Non-members and anon see nothing.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.as_user('user_alice');
select is(
  (select count(*)::int from public.swipes where session_id = (:'session_id')::uuid),
  2,
  'swipes RLS: alice sees BOTH her swipe and bob''s (pod partner mirror)'
);

select tests.as_user('user_bob');
select is(
  (select count(*)::int from public.swipes where session_id = (:'session_id')::uuid),
  2,
  'swipes RLS: bob sees both swipes for the same reason'
);

select tests.as_user('user_carol');
select is(
  (select count(*)::int from public.swipes where session_id = (:'session_id')::uuid),
  0,
  'swipes RLS: cross-pod user (carol) sees zero swipes from pod1'
);

select tests.as_user('user_dave');
select is(
  (select count(*)::int from public.swipes where session_id = (:'session_id')::uuid),
  0,
  'swipes RLS: cross-pod user (dave) sees zero swipes from pod1'
);

select tests.as_anon();
select is(
  (select count(*)::int from public.swipes where session_id = (:'session_id')::uuid),
  0,
  'swipes RLS: anon role sees zero swipes (no policy applies)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MATCHES — read policy: pod members can read; non-members and anon cannot.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.as_user('user_alice');
select is(
  (select count(*)::int from public.matches where pod_id = (:'pod1')::uuid),
  1,
  'matches RLS: alice sees her pod''s match row'
);

select tests.as_user('user_bob');
select is(
  (select count(*)::int from public.matches where pod_id = (:'pod1')::uuid),
  1,
  'matches RLS: bob (partner) sees the same match row'
);

select tests.as_user('user_carol');
select is(
  (select count(*)::int from public.matches where pod_id = (:'pod1')::uuid),
  0,
  'matches RLS: cross-pod user (carol) cannot read pod1''s matches'
);

select tests.as_anon();
select is(
  (select count(*)::int from public.matches where pod_id = (:'pod1')::uuid),
  0,
  'matches RLS: anon cannot read matches'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MATCHES — update policy: pod members can mark cooked / soft-delete via
-- removed_at. Non-members cannot. UPDATEs that target nothing are also
-- valid policy verification (returning 0 rows is the expected RLS outcome,
-- not an error).
-- ─────────────────────────────────────────────────────────────────────────────

select tests.as_user('user_alice');
with upd as (
  update public.matches
    set cooked_at = now()
    where id = (:'match_id')::uuid
    returning id
)
select is((select count(*)::int from upd), 1,
  'matches RLS: alice can update her pod''s match (cooked_at)');

-- Bob (partner) can also update — it's a shared cookbook.
select tests.as_user('user_bob');
with upd as (
  update public.matches
    set removed_at = now()
    where id = (:'match_id')::uuid
    returning id
)
select is((select count(*)::int from upd), 1,
  'matches RLS: bob (partner) can soft-delete via removed_at');

-- Restore so the cross-pod test below sees an active row.
select tests.as_service();
update public.matches set removed_at = null, cooked_at = null where id = (:'match_id')::uuid;

select tests.as_user('user_carol');
with upd as (
  update public.matches
    set removed_at = now()
    where id = (:'match_id')::uuid
    returning id
)
select is((select count(*)::int from upd), 0,
  'matches RLS: cross-pod user (carol) cannot update pod1''s match (USING filter zeros it)');

-- ─────────────────────────────────────────────────────────────────────────────
-- MATCHES — insert: there is NO insert policy in 016_rls_policies.sql, so
-- direct client-side inserts MUST fail. The only insert path is the
-- security-definer submit_swipe RPC.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_recipe('Direct Insert Recipe') as recipe2 \gset

select tests.as_user('user_alice');
select throws_ok(
  format(
    $$ insert into public.matches(pod_id, recipe_id, session_id)
       values (%L::uuid, %L::uuid, %L::uuid) $$,
    :'pod1', :'recipe2', :'session_id'
  ),
  '42501',
  null,
  'matches RLS: direct client-side INSERT is rejected (no INSERT policy exists)'
);

-- Confirm no row leaked through despite the policy denial.
select tests.as_service();
select is(
  (select count(*)::int from public.matches
    where pod_id = (:'pod1')::uuid and recipe_id = (:'recipe2')::uuid),
  0,
  'matches RLS: no row materialized from the denied INSERT attempt'
);

select * from finish();
rollback;
