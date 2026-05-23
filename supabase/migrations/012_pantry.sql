-- 012_pantry.sql
-- Source: docs/DESIGN/README.md §3.2.13, Decision D-8
-- Shared pantry. name_clean (lowercase + singularized client-side) is the dedup key.

create table pantry_items (
  id                 uuid primary key default gen_random_uuid(),
  pod_id             uuid not null references pods(id) on delete cascade,
  name               text not null,
  name_clean         text,
  quantity           numeric,
  unit               text,
  expires_at         timestamptz,
  updated_by_user_id text not null references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index uq_pantry_pod_name on pantry_items(pod_id, name_clean);
create index ix_pantry_pod_expires on pantry_items(pod_id, expires_at)
  where expires_at is not null;

create trigger trg_pantry_updated_at
  before update on pantry_items
  for each row execute function set_updated_at();
