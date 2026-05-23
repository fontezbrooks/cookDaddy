-- 014_helpers.sql
-- Source: docs/DESIGN/README.md §3.4
-- Auth helper: extract Clerk user id from JWT claims (sub).
-- Pod-membership helper: cheap stable function used by every pod-scoped RLS policy.

create or replace function auth_user_id() returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  );
$$;

-- SECURITY DEFINER so the membership check itself bypasses RLS — otherwise the
-- pm_read policy on pod_members calls is_pod_member() which queries pod_members
-- which… infinite recursion. Definer + locked search_path is the supabase-recommended
-- pattern for RLS helpers.
create or replace function is_pod_member(p_pod_id uuid, p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pod_members
    where pod_id = p_pod_id
      and user_id = p_user_id
  );
$$;

-- Anyone may ask "is X a member of Y?" — it leaks only what a member would already see.
grant execute on function is_pod_member(uuid, text) to authenticated, anon;
