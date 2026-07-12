-- 027_pod_read_rpcs.sql — pod read-path rebuild (docs/POD-READ-PATH/README.md).
--
-- The client previously read pod membership through PostgREST + RLS
-- (pm_read → is_pod_member) while every mutation went through SECURITY DEFINER
-- RPCs resolving the caller via auth_user_id(). When the RLS read silently
-- returned zero rows, the app believed the user was unpaired while
-- create_pod_invite kept raising already_in_a_pod — an unrecoverable
-- split-brain. These functions move the read (FR-1) and the recovery escape
-- hatch (FR-4) onto the same trusted path as the mutations.

-- ─────────────────────────────────────────────────────────────────────────────
-- get_my_pod(): the caller's active pod in one call — pod id, partner columns
-- (null while solo) and member count. Zero rows when the caller has no active
-- (non-archived) pod. Replaces the client-side pod_members read AND the
-- follow-up partner lookup, so there is no RLS-visibility race between them.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_my_pod()
returns table (
  pod_id uuid,
  partner_user_id text,
  partner_display_name text,
  member_count int
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
  select pm.pod_id,
         partner.user_id,
         u.display_name,
         (select count(*)::int from pod_members c where c.pod_id = pm.pod_id)
    from pod_members pm
    join pods p
      on p.id = pm.pod_id
     and p.archived_at is null
    left join pod_members partner
      on partner.pod_id = pm.pod_id
     and partner.user_id <> v_user
    left join users u
      on u.id = partner.user_id
   where pm.user_id = v_user
   limit 1;
end;
$$;

revoke all on function get_my_pod() from public;
grant execute on function get_my_pod() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- leave_my_pod(): no-arg escape hatch. Resolves the caller's active pod
-- server-side and dissolves it via dissolve_pod (025 — locking, member
-- deletion, invite expiry, archive). Returns true when a pod was dissolved,
-- false when the caller had no active pod (idempotent no-op) — so the client
-- can always offer "Leave pod" even when its local store is empty.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function leave_my_pod()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text;
  v_pod  uuid;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select pm.pod_id
    into v_pod
    from pod_members pm
    join pods p on p.id = pm.pod_id
   where pm.user_id = v_user
     and p.archived_at is null
   limit 1;

  if v_pod is null then
    return false;
  end if;

  perform dissolve_pod(v_pod);
  return true;
end;
$$;

revoke all on function leave_my_pod() from public;
grant execute on function leave_my_pod() to authenticated;
