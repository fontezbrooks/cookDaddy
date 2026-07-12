-- 028_get_session_rpc.sql — extend the trusted read path to the session
-- screen (docs/POD-READ-PATH/README.md follow-up; spec Open Question 1).
--
-- Post-027 device evidence: start_session (SECURITY DEFINER) succeeds, the
-- pod-scoped RLS SELECT of the created row returns nothing, and the RLS
-- definitions on cloud verifiably match the migrations (pg_proc/pg_policies
-- probes 2026-07-12). Same class as the pod-membership split-brain 027 fixed:
-- reads through the RLS path fail on device while the definer path works.
-- get_session moves the session bootstrap read onto the definer path.

-- ─────────────────────────────────────────────────────────────────────────────
-- get_session(p_session_id): the session row + the pod's created_at (used by
-- the first-ever-match analytics variant) in one call. Membership-gated inside
-- the function — non-members of the session's pod get zero rows, identical to
-- a nonexistent session, so session ids cannot be probed.
-- ─────────────────────────────────────────────────────────────────────────────
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
         s.ended_reason,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Hardening: Supabase's default privileges can grant anon a DIRECT execute on
-- newly created functions, which `revoke ... from public` does not remove.
-- Re-assert the anon revoke for 027's functions explicitly.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function get_my_pod() from anon;
revoke all on function leave_my_pod() from anon;
