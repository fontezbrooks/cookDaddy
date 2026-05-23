-- 009_matches.sql
-- Source: docs/DESIGN/README.md §3.2.9, §7
-- Exactly-once per (pod, recipe). The unique constraint is the final backstop for the race
-- analysis in DESIGN §7.3.

create table matches (
  id         uuid primary key default gen_random_uuid(),
  pod_id     uuid not null references pods(id) on delete cascade,
  recipe_id  uuid not null references recipes(id) on delete cascade,
  session_id uuid not null references sessions(id),
  matched_at timestamptz not null default now(),
  cooked_at  timestamptz,
  removed_at timestamptz,
  unique (pod_id, recipe_id)
);

create index ix_matches_pod_active on matches(pod_id) where removed_at is null;
create index ix_matches_pod_matched on matches(pod_id, matched_at desc);
