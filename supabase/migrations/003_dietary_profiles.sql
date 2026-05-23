-- 003_dietary_profiles.sql
-- Source: docs/DESIGN/README.md §3.2.2
-- Per-user dietary preferences. STRICT self-only RLS (see 016) — never readable by partner.

create table dietary_profiles (
  user_id          text primary key references users(id) on delete cascade,
  hard_exclusions  dietary_hard[] not null default '{}',
  soft_preferences dietary_soft[] not null default '{}',
  updated_at       timestamptz not null default now()
);

create trigger trg_dietary_profiles_updated_at
  before update on dietary_profiles
  for each row execute function set_updated_at();
