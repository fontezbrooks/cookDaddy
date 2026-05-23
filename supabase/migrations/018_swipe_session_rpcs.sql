-- 018_swipe_session_rpcs.sql
-- Source: docs/DESIGN/README.md §7 + docs/WORKFLOW/README.md §9
--
-- P6 server side: live-sync swipe sessions.
--
--   start_session(pod_id)           creates a lobby row with a freshly-
--                                   computed deck and returns it.
--   mark_session_active(session_id) flips lobby → active (called once both
--                                   partners have signaled Ready client-side).
--   submit_swipe(...)               the hot path; spec-verbatim per DESIGN
--                                   §7.1. FOR UPDATE on sessions serializes
--                                   match detection for a pod; the unique
--                                   constraint on matches is the backstop.
--   end_session(session_id, reason) flips active → ended.
--   notify_match_created trigger    pg_notify('match.created', ...) so the
--                                   P11 push fan-out worker can wake up
--                                   backgrounded partners. The in-app match
--                                   overlay rides Realtime broadcast (client).
--
-- All RPCs are SECURITY DEFINER with locked search_path; clients have no
-- direct INSERT/UPDATE policies on sessions/swipes/matches outside these.

-- ─────────────────────────────────────────────────────────────────────────────
-- compute_session_deck(pod_id) — deterministic-shape helper.
-- v0 selects 50 random complete recipes that BOTH partners haven't
-- right-swiped historically (D-7 forever exclusion), haven't left-swiped in
-- the last 30 days (D-7), and that the pod hasn't already matched.
-- Dietary profile + health-score filtering (D-8) lands in v1.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function compute_session_deck(p_pod_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, extensions
as $$
  with members as (
    select user_id from pod_members where pod_id = p_pod_id
  ),
  excluded as (
    select recipe_id from swipes
      where user_id in (select user_id from members)
        and direction = 'right'
    union
    select recipe_id from swipes
      where user_id in (select user_id from members)
        and direction = 'left'
        and created_at > now() - interval '30 days'
    union
    select recipe_id from matches
      where pod_id = p_pod_id and removed_at is null
  )
  select coalesce(array_agg(id), '{}'::uuid[])
  from (
    select id from recipes
    where is_complete = true
      and id not in (select recipe_id from excluded)
    order by random()
    limit 50
  ) r;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- start_session(pod_id): authenticated pod member creates a lobby-state
-- session with a fresh deck. Returns { session_id, deck_recipe_ids }.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function start_session(p_pod_id uuid)
returns table(session_id uuid, deck_recipe_ids uuid[])
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user    text;
  v_session uuid;
  v_deck    uuid[];
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  if not is_pod_member(p_pod_id, v_user) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  v_deck := compute_session_deck(p_pod_id);

  insert into public.sessions(pod_id, started_by, status, deck_recipe_ids)
    values (p_pod_id, v_user, 'lobby', v_deck)
    returning id into v_session;

  session_id := v_session;
  deck_recipe_ids := v_deck;
  return next;
end;
$$;

revoke all on function start_session(uuid) from public;
grant execute on function start_session(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- mark_session_active(session_id): flips lobby → active. Idempotent on
-- already-active; raises on ended.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function mark_session_active(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user   text;
  v_pod    uuid;
  v_status session_status;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select pod_id, status into v_pod, v_status
    from sessions where id = p_session_id;
  if v_pod is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if not is_pod_member(v_pod, v_user) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if v_status = 'active' then
    return;
  end if;
  if v_status = 'ended' then
    raise exception 'session_not_pending' using errcode = 'P0001';
  end if;

  update sessions set status = 'active' where id = p_session_id;
end;
$$;

revoke all on function mark_session_active(uuid) from public;
grant execute on function mark_session_active(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- submit_swipe(session_id, recipe_id, direction): hot path per DESIGN §7.1.
-- The FOR UPDATE lock on sessions serializes match detection for the pod;
-- the unique constraint on matches(pod_id, recipe_id) is the race backstop.
-- Returns one row { match, match_id, already_matched }.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function submit_swipe(
  p_session_id uuid,
  p_recipe_id  uuid,
  p_direction  swipe_direction
) returns table(match boolean, match_id uuid, already_matched boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user     text;
  v_pod      uuid;
  v_partner  text;
  v_match    uuid;
  v_existing boolean;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select s.pod_id into v_pod
    from sessions s
    where s.id = p_session_id and s.status = 'active'
    for update;

  if v_pod is null then
    raise exception 'session_not_active' using errcode = 'P0001';
  end if;
  if not is_pod_member(v_pod, v_user) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  insert into swipes(session_id, pod_id, user_id, recipe_id, direction)
    values (p_session_id, v_pod, v_user, p_recipe_id, p_direction)
    on conflict (session_id, user_id, recipe_id) do nothing;

  if p_direction = 'left' then
    match := false;
    match_id := null;
    already_matched := false;
    return next;
    return;
  end if;

  select pm.user_id into v_partner
    from pod_members pm
    where pm.pod_id = v_pod and pm.user_id <> v_user;

  select exists (
    select 1 from swipes
    where pod_id = v_pod
      and user_id = v_partner
      and recipe_id = p_recipe_id
      and direction = 'right'
  ) into v_existing;

  if not v_existing then
    match := false;
    match_id := null;
    already_matched := false;
    return next;
    return;
  end if;

  insert into matches(pod_id, recipe_id, session_id)
    values (v_pod, p_recipe_id, p_session_id)
    on conflict (pod_id, recipe_id) do nothing
    returning id into v_match;

  if v_match is null then
    -- Already matched (prior session, or simultaneous swipe lost the race).
    match := false;
    match_id := null;
    already_matched := true;
    return next;
    return;
  end if;

  match := true;
  match_id := v_match;
  already_matched := false;
  return next;
end;
$$;

revoke all on function submit_swipe(uuid, uuid, swipe_direction) from public;
grant execute on function submit_swipe(uuid, uuid, swipe_direction) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- end_session(session_id, reason): either partner ends. Idempotent on
-- already-ended sessions so a Realtime race can't 500 the second caller.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function end_session(
  p_session_id uuid,
  p_reason     session_end_reason
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user   text;
  v_pod    uuid;
  v_status session_status;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select pod_id, status into v_pod, v_status
    from sessions where id = p_session_id;
  if v_pod is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if not is_pod_member(v_pod, v_user) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if v_status = 'ended' then
    return;
  end if;

  update sessions
    set status = 'ended', ended_at = now(), ended_reason = p_reason
    where id = p_session_id;
end;
$$;

revoke all on function end_session(uuid, session_end_reason) from public;
grant execute on function end_session(uuid, session_end_reason) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- notify_match_created: pg_notify so the P11 push fan-out worker can wake up
-- backgrounded partners. In-app match overlay rides Realtime broadcast.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function notify_match_created_fn() returns trigger
language plpgsql as $$
begin
  perform pg_notify(
    'match.created',
    jsonb_build_object(
      'match_id',   new.id,
      'pod_id',     new.pod_id,
      'session_id', new.session_id,
      'recipe_id',  new.recipe_id,
      'matched_at', new.matched_at
    )::text
  );
  return new;
end;
$$;

create trigger trg_notify_match_created
  after insert on matches
  for each row execute function notify_match_created_fn();
