-- 015_rls_enable.sql
-- Source: docs/DESIGN/README.md §3.5
-- Enable RLS on every table that holds pod-scoped or user-scoped data, plus the catalog
-- (catalog stays readable to authed users only — see policies in 016).

alter table users enable row level security;
alter table dietary_profiles enable row level security;
alter table pods enable row level security;
alter table pod_members enable row level security;
alter table pod_invites enable row level security;
alter table sessions enable row level security;
alter table swipes enable row level security;
alter table matches enable row level security;
alter table recipe_ratings enable row level security;
alter table recipe_notes enable row level security;
alter table shopping_list_items enable row level security;
alter table pantry_items enable row level security;
alter table push_tokens enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
