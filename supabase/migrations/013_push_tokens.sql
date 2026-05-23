-- 013_push_tokens.sql
-- Source: docs/DESIGN/README.md §3.2.14, §9.4
-- Expo push tokens. last_seen is bumped on each app foreground; daily cron prunes >30d stale tokens.

create table push_tokens (
  user_id    text not null references users(id) on delete cascade,
  expo_token text primary key,
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create index ix_push_tokens_user on push_tokens(user_id);
create index ix_push_tokens_last_seen on push_tokens(last_seen);
