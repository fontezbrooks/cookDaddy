-- 007_sessions.sql
-- Source: docs/DESIGN/README.md §3.2.7, §3.3
-- Live-sync swipe sessions. Decks are pre-computed and deterministic per Decision D-7.

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  pod_id          uuid not null references pods(id) on delete cascade,
  started_by      text not null references users(id),
  status          session_status not null default 'lobby',
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  ended_reason    session_end_reason,
  deck_recipe_ids uuid[] not null
);

create index ix_sessions_pod_started on sessions(pod_id, started_at desc);
create index ix_sessions_status on sessions(status) where status <> 'ended';

-- Sessions can only be started for fully-paired pods (exactly 2 members).
create or replace function check_pod_full() returns trigger
language plpgsql as $$
begin
  if (select count(*) from pod_members where pod_id = new.pod_id) <> 2 then
    raise exception 'pod % must have exactly 2 members to start a session', new.pod_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_pod_full_for_session
  before insert on sessions
  for each row execute function check_pod_full();
