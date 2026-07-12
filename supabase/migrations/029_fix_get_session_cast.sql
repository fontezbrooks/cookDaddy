-- 029_fix_get_session_cast.sql — fix 42804 in get_session (028).
--
-- sessions.ended_reason is the enum session_end_reason (001_enums.sql), but
-- 028 declared column 5 of the return table as text and only cast status.
-- Every call failed with "structure of query does not match function result
-- type" (device HAR 2026-07-12, 32× POST /rpc/get_session → 400 42804 —
-- which also proved the authenticated role now reaches the function, i.e.
-- the Clerk role-claim fix landed). Same body as 028 plus ended_reason::text.

create or replace function get_session(p_session_id uuid)
returns table (
  id uuid,
  status text,
  pod_id uuid,
  deck_recipe_ids uuid[],
  ended_reason text,
  pod_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user text;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  return query
  select s.id,
         s.status::text,
         s.pod_id,
         s.deck_recipe_ids,
         s.ended_reason::text,
         p.created_at
    from sessions s
    join pods p on p.id = s.pod_id
   where s.id = p_session_id
     and is_pod_member(s.pod_id, v_user);
end;
$$;

revoke all on function get_session(uuid) from public;
revoke all on function get_session(uuid) from anon;
grant execute on function get_session(uuid) to authenticated;
