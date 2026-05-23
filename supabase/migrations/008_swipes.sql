-- 008_swipes.sql
-- Source: docs/DESIGN/README.md §3.2.8, §7
-- Append-only swipe ledger. pod_id is denormalized for RLS performance (avoids join on hot path).
-- Unique (session_id, user_id, recipe_id) is the idempotency contract for client-retried swipes.

create table swipes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  pod_id     uuid not null references pods(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  recipe_id  uuid not null references recipes(id),
  direction  swipe_direction not null,
  created_at timestamptz not null default now(),
  unique (session_id, user_id, recipe_id)
);

create index ix_swipes_pod_recipe_dir on swipes(pod_id, recipe_id, direction);
create index ix_swipes_user_dir_created on swipes(user_id, direction, created_at desc);
