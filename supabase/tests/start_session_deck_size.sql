-- Source: docs/DESIGN/README.md §17.4 — deck_size narrows start_session decks.
-- Guarantee: default/no-flag path still creates up to 50 cards; explicit
-- deck_size is clamped to [5,50].

begin;
select plan(5);

select tests.seed_paired_pod() as pod \gset

-- compute_session_deck pulls from all is_complete recipes. CI runs against a
-- freshly-reset local DB with only a handful of complete recipes (cloud has
-- ~89), so seed enough here to make the [5,50] size caps observable regardless
-- of ambient catalog size. A fresh pod has no swipes/matches, so none are excluded.
select tests.as_service();
insert into public.recipes(external_id, title, raw_payload, is_complete)
select 900000000 + g, 'Deck Size Recipe ' || g, '{}'::jsonb, true
from generate_series(1, 12) g;

select tests.as_user('user_alice');
select * from public.start_session((:'pod')::uuid, 10) \gset s10_

select is(
  cardinality(:'s10_deck_recipe_ids'::uuid[]),
  10,
  'explicit deck_size 10 returns 10 recipes'
);

select * from public.start_session((:'pod')::uuid, 999) \gset s999_

select ok(
  cardinality(:'s999_deck_recipe_ids'::uuid[]) <= 50,
  'deck_size clamps to an upper bound of 50'
);

select * from public.start_session((:'pod')::uuid) \gset sdefault_

select ok(
  cardinality(:'sdefault_deck_recipe_ids'::uuid[]) <= 50,
  'single-arg start_session keeps the default deck cap'
);

select * from public.start_session((:'pod')::uuid, 1) \gset s1_

select is(
  cardinality(:'s1_deck_recipe_ids'::uuid[]),
  5,
  'deck_size clamps to a lower bound of 5'
);

select tests.as_user('user_carol');
select throws_ok(
  format($$ select * from public.start_session(%L::uuid, 10) $$, :'pod'),
  'P0001',
  'not_member',
  'non-member cannot start a deck-sized session for that pod'
);

select * from finish();
rollback;
