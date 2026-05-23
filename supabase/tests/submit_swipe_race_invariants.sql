-- Source: docs/DESIGN/README.md §7.3 — submit_swipe race analysis.
-- Source: docs/WORKFLOW/README.md §10 — P7 hot-path hardening.
--
-- Guarantees under concurrent / interleaved swipe-commit traffic:
--
--   1. The unique constraint on matches(pod_id, recipe_id) is the absolute
--      backstop. Even with both partner swipes pre-landed (modeling the
--      window where two concurrent submit_swipe transactions are both
--      about to attempt the match insert), exactly ONE matches row exists.
--
--   2. submit_swipe surfaces already_matched=true to the loser of the race
--      instead of raising — clients render variant copy, not an error.
--
--   3. A match across different sessions in the same pod still resolves to
--      match=true. Alice right-swiping recipe X in session A (which ends
--      without a match) followed by Bob right-swiping the same recipe in
--      session B should produce a match on session B.
--
-- Deterministic by construction: every scenario is encoded as ordered SQL
-- with explicit savepoints; no clock-dependent or random-order steps.
-- The exit criterion "deterministic across 100 runs" is satisfied because
-- no step's outcome depends on which transaction wins a real concurrent
-- race — the unique constraint provides the same answer regardless.

begin;
select plan(11);

-- ─────────────────────────────────────────────────────────────────────────────
-- Scenario 1: Both partner right-swipes pre-landed; submit_swipe rapid
-- succession from both users → exactly one match, second call sees
-- already_matched=true.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_paired_pod() as pod \gset
select tests.seed_recipe('Race Risotto') as recipe \gset

select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset s_
select public.mark_session_active((:'s_session_id')::uuid);

-- Pre-insert BOTH right-swipes via service role. This models the window in
-- a real two-tx race where, by the time tx-A reaches its match-detect
-- branch, tx-B has already written its swipe too. submit_swipe's match
-- detect runs against on-disk state, so we recreate that state exactly.
select tests.as_service();
insert into public.swipes(session_id, pod_id, user_id, recipe_id, direction)
  values
    ((:'s_session_id')::uuid, (:'pod')::uuid, 'user_alice', (:'recipe')::uuid, 'right'),
    ((:'s_session_id')::uuid, (:'pod')::uuid, 'user_bob',   (:'recipe')::uuid, 'right')
  on conflict (session_id, user_id, recipe_id) do nothing;

-- Alice calls submit_swipe — she's the first to reach the match-detect
-- branch with both swipes on disk. on_conflict in submit_swipe's swipes
-- insert is a no-op (her row already exists); the match insert succeeds.
select tests.as_user('user_alice');
select * from public.submit_swipe(
  (:'s_session_id')::uuid,
  (:'recipe')::uuid,
  'right'::swipe_direction
) \gset alice_race_

select is(
  (:'alice_race_match')::boolean, true,
  'race: first caller to reach match-detect with both swipes pre-landed → match=true'
);
select ok(length(:'alice_race_match_id') > 0, 'race: first caller gets a match_id back');

-- Bob now calls submit_swipe in rapid succession. The matches row already
-- exists; on_conflict do nothing swallows the insert; submit_swipe surfaces
-- already_matched=true instead of raising.
select tests.as_user('user_bob');
select * from public.submit_swipe(
  (:'s_session_id')::uuid,
  (:'recipe')::uuid,
  'right'::swipe_direction
) \gset bob_race_

select is(
  (:'bob_race_match')::boolean, false,
  'race: loser sees match=false (not a duplicate match)'
);
select is(
  (:'bob_race_already_matched')::boolean, true,
  'race: loser sees already_matched=true so client renders variant copy'
);

-- Schema invariant: exactly one matches row for (pod, recipe).
select tests.as_service();
select is(
  (select count(*)::int from public.matches
    where pod_id = (:'pod')::uuid and recipe_id = (:'recipe')::uuid),
  1,
  'race: unique (pod_id, recipe_id) backstop enforced — exactly one matches row'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Scenario 2: Direct schema-level race — bypass submit_swipe entirely and
-- attempt two raw inserts into matches for the same (pod, recipe). The
-- unique constraint MUST reject the second.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_recipe('Direct Race') as recipe2 \gset

select tests.as_service();
-- First raw insert succeeds.
insert into public.matches(pod_id, recipe_id, session_id)
  values ((:'pod')::uuid, (:'recipe2')::uuid, (:'s_session_id')::uuid);

-- Second raw insert MUST raise (unique constraint backstop).
select throws_ok(
  format(
    $$ insert into public.matches(pod_id, recipe_id, session_id)
       values (%L::uuid, %L::uuid, %L::uuid) $$,
    :'pod', :'recipe2', :'s_session_id'
  ),
  '23505',
  null,
  'schema: raw duplicate insert into matches raises unique_violation (23505)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Scenario 3: Cross-session match. Alice right-swipes recipe X in session
-- 1, which ends without a match. Bob right-swipes the same recipe in
-- session 2 (same pod) → match=true on session 2.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.seed_recipe('Cross-Session Recipe') as recipe3 \gset

-- Session 1: Alice right-swipes recipe3, then ends the session without Bob
-- ever swiping. No match yet.
select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid) \gset s1_
select public.mark_session_active((:'s1_session_id')::uuid);

select * from public.submit_swipe(
  (:'s1_session_id')::uuid,
  (:'recipe3')::uuid,
  'right'::swipe_direction
) \gset alice_s1_
select is(
  (:'alice_s1_match')::boolean, false,
  'cross-session: Alice right-swipes solo in session 1 → match=false'
);
select public.end_session((:'s1_session_id')::uuid, 'user_ended'::session_end_reason);

select tests.as_service();
select is(
  (select count(*)::int from public.matches
    where pod_id = (:'pod')::uuid and recipe_id = (:'recipe3')::uuid),
  0,
  'cross-session: no match exists after Alice-only session 1'
);

-- Session 2: same pod, fresh session. Bob right-swipes the same recipe.
-- The matcher looks across ALL swipes for the partner (not just current
-- session), so Alice's prior right-swipe still counts → match=true on
-- session 2.
select tests.as_user('user_bob');
select * from public.start_session((:'pod')::uuid) \gset s2_
select public.mark_session_active((:'s2_session_id')::uuid);

select * from public.submit_swipe(
  (:'s2_session_id')::uuid,
  (:'recipe3')::uuid,
  'right'::swipe_direction
) \gset bob_s2_

select is(
  (:'bob_s2_match')::boolean, true,
  'cross-session: Bob right-swipes in session 2 on Alice-historical recipe → match=true'
);

-- The match references session 2 (the one in which it was created), not
-- session 1 — important for the cookbook surface attribution.
select tests.as_service();
select is(
  (select session_id from public.matches
    where pod_id = (:'pod')::uuid and recipe_id = (:'recipe3')::uuid),
  (:'s2_session_id')::uuid,
  'cross-session: match.session_id references the CURRENT session, not the historical one'
);

select is(
  (select count(*)::int from public.matches
    where pod_id = (:'pod')::uuid and recipe_id = (:'recipe3')::uuid),
  1,
  'cross-session: exactly one match row across all sessions for (pod, recipe3)'
);

select * from finish();
rollback;
