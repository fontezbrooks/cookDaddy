-- 024_start_session_deck_size.sql
-- Source: docs/DESIGN/README.md §17.4 — wire the PostHog `deck_size` flag into start_session.
-- Default path (no p_deck_size / null) is unchanged: deck of up to 50.

drop function if exists start_session(uuid);
drop function if exists compute_session_deck(uuid);

create or replace function compute_session_deck(p_pod_id uuid, p_deck_size int default 50)
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
    limit p_deck_size
  ) r;
$$;

create or replace function start_session(p_pod_id uuid, p_deck_size int default null)
returns table(session_id uuid, deck_recipe_ids uuid[])
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user    text;
  v_session uuid;
  v_deck    uuid[];
  v_size    int;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  if not is_pod_member(p_pod_id, v_user) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  v_size := case when p_deck_size is null then 50 else least(greatest(p_deck_size, 5), 50) end;
  v_deck := compute_session_deck(p_pod_id, v_size);

  insert into public.sessions(pod_id, started_by, status, deck_recipe_ids)
    values (p_pod_id, v_user, 'lobby', v_deck)
    returning id into v_session;

  session_id := v_session;
  deck_recipe_ids := v_deck;
  return next;
end;
$$;

revoke all on function compute_session_deck(uuid, int) from public;
revoke all on function start_session(uuid, int) from public;
grant execute on function start_session(uuid, int) to authenticated;
