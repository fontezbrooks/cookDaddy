-- 011_shopping_list.sql
-- Source: docs/DESIGN/README.md §3.2.12
-- Shared shopping list scoped to a pod. checked_at IS NOT NULL == "in cart / done".

create table shopping_list_items (
  id               uuid primary key default gen_random_uuid(),
  pod_id           uuid not null references pods(id) on delete cascade,
  name             text not null,
  quantity         numeric,
  unit             text,
  category         text,
  source_recipe_id uuid references recipes(id),
  added_by_user_id text not null references users(id),
  checked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index ix_shopping_list_pod_checked on shopping_list_items(pod_id, checked_at);
create index ix_shopping_list_pod_created on shopping_list_items(pod_id, created_at desc);

create trigger trg_shopping_list_updated_at
  before update on shopping_list_items
  for each row execute function set_updated_at();
