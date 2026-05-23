-- 005_pod_invites.sql
-- Source: docs/DESIGN/README.md §3.2.4, §8.2
-- Share-link invite tokens. Server stores HMAC-SHA256(token, server_secret); raw token never persisted.

create table pod_invites (
  id              uuid primary key default gen_random_uuid(),
  pod_id          uuid not null references pods(id) on delete cascade,
  inviter_user_id text not null references users(id) on delete cascade,
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  consumed_by     text references users(id),
  created_at      timestamptz not null default now()
);

create index ix_pod_invites_token_hash on pod_invites(token_hash);
create index ix_pod_invites_pod on pod_invites(pod_id);
