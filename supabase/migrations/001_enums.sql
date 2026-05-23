-- 001_enums.sql
-- Source: docs/DESIGN/README.md §3.1
-- Enum types used across schema. Defined first so later migrations can reference them.

create type swipe_direction as enum ('right', 'left');

create type session_status as enum ('lobby', 'active', 'ended');

create type session_end_reason as enum (
  'completed',
  'user_ended',
  'partner_disconnect',
  'timeout'
);

create type dietary_hard as enum (
  'vegan',
  'vegetarian',
  'pescatarian',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'peanut_free',
  'shellfish_free',
  'egg_free',
  'soy_free',
  'pork_free',
  'beef_free',
  'halal',
  'kosher'
);

create type dietary_soft as enum (
  'low_carb',
  'low_sodium',
  'low_sugar',
  'high_protein',
  'low_fat',
  'keto',
  'paleo',
  'mediterranean'
);
