-- 010_ratings_notes.sql
-- Source: docs/DESIGN/README.md §3.2.10, §3.2.11, Decision D-10
-- recipe_ratings: per-user 1–5 stars within a pod.
-- recipe_notes:   one shared text body per match (FK enforces match must exist).

create table recipe_ratings (
  pod_id     uuid not null references pods(id) on delete cascade,
  recipe_id  uuid not null references recipes(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (pod_id, recipe_id, user_id)
);

create index ix_recipe_ratings_pod on recipe_ratings(pod_id);

create trigger trg_recipe_ratings_updated_at
  before update on recipe_ratings
  for each row execute function set_updated_at();

create table recipe_notes (
  pod_id         uuid not null,
  recipe_id      uuid not null,
  body           text not null default '',
  last_edited_by text not null references users(id),
  updated_at     timestamptz not null default now(),
  primary key (pod_id, recipe_id),
  foreign key (pod_id, recipe_id) references matches(pod_id, recipe_id) on delete cascade
);

create trigger trg_recipe_notes_updated_at
  before update on recipe_notes
  for each row execute function set_updated_at();
