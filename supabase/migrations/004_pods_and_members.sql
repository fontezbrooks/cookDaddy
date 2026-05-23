-- 004_pods_and_members.sql
-- Source: docs/DESIGN/README.md §3.2.3, §3.3
-- Pods are 1:1 partner units. One active pod per user (enforced via trigger, per Decision D-4).

create table pods (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table pod_members (
  pod_id    uuid not null references pods(id) on delete cascade,
  user_id   text not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pod_id, user_id)
);

create index ix_pod_members_user on pod_members(user_id);

-- One active pod per user. Postgres won't accept a subquery in an index predicate, so we
-- enforce via a BEFORE INSERT trigger.
create or replace function check_one_active_pod() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1
    from pod_members pm
    join pods p on p.id = pm.pod_id
    where pm.user_id = new.user_id
      and p.archived_at is null
      and pm.pod_id <> new.pod_id
  ) then
    raise exception 'user % already belongs to an active pod', new.user_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_one_active_pod
  before insert on pod_members
  for each row execute function check_one_active_pod();
