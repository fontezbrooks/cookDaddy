-- 023_push_notifications.sql
-- Source: docs/DESIGN/README.md §9.4 + §16.2, docs/WORKFLOW/README.md §14 (P11).
-- notification_prefs: per-user, per-type push opt-outs (opt-out model, default on).
-- Read server-side by the fan-out-push Edge Function; written client-side from
-- Settings → Notifications. prune_stale_push_tokens(): daily-cron-able cleanup of
-- tokens not seen in 30 days (DESIGN §9.4).

create table notification_prefs (
  user_id                text primary key references users(id) on delete cascade,
  match_enabled          boolean not null default true,
  session_invite_enabled boolean not null default true,
  pod_joined_enabled     boolean not null default true,
  updated_at             timestamptz not null default now()
);

create trigger trg_notification_prefs_updated_at
  before update on notification_prefs
  for each row execute function set_updated_at();

alter table notification_prefs enable row level security;

-- Strict self-only, mirrors push_tokens.pt_self.
create policy np_self on notification_prefs
  for all to authenticated
  using (user_id = auth_user_id())
  with check (user_id = auth_user_id());

-- Daily-cron-able prune of stale Expo push tokens (DESIGN §9.4). Returns the
-- number of rows deleted. service_role only.
create or replace function prune_stale_push_tokens()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from push_tokens where last_seen < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function prune_stale_push_tokens() from public, anon, authenticated;
grant execute on function prune_stale_push_tokens() to service_role;
