-- 002_users.sql
-- Source: docs/DESIGN/README.md §3.2.1
-- Mirror of Clerk user identity. PK is the Clerk user id (text), per Decision D-3.

create table users (
  id           text primary key,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();
