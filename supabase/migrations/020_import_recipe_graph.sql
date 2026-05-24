-- 020_import_recipe_graph.sql
-- Source: docs/DATABASE_REFACTOR/DESIGN/README.md §8 + WORKFLOW B2.
-- Atomic graph writer for Spoonacular recipe ingestion. The plpgsql function
-- runs in the caller's transaction and replaces the full normalized child graph
-- after upserting the parent recipe.

create or replace function import_recipe_graph(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe    jsonb := payload->'recipe';
  v_recipe_id uuid;
  v_inserted  boolean;
  v_ing jsonb; v_ing_id uuid;
  v_ni  jsonb; v_ni_id  uuid;
  v_grp jsonb; v_grp_id uuid;
  v_step jsonb; v_step_id uuid;
begin
  if v_recipe is null or (v_recipe->>'external_id') is null then
    raise exception 'import_recipe_graph: payload.recipe.external_id required' using errcode = 'P0001';
  end if;

  insert into recipes as r (
    external_id, title, image_url, source_url, source_name, credits_text, license,
    ready_in_minutes, servings, health_score, image_type, spoonacular_source_url,
    preparation_minutes, cooking_minutes, summary, instructions, language, original_id,
    gaps, aggregate_likes, spoonacular_score, price_per_serving_cents,
    weight_watcher_smart_points, caloric_percent_protein, caloric_percent_fat,
    caloric_percent_carbs, weight_per_serving_amount, weight_per_serving_unit,
    vegetarian, vegan, gluten_free, dairy_free, very_healthy, cheap, very_popular,
    sustainable, low_fodmap, ketogenic, whole30, raw_payload, is_complete, updated_at
  ) values (
    (v_recipe->>'external_id')::bigint,
    v_recipe->>'title',
    v_recipe->>'image_url',
    v_recipe->>'source_url',
    v_recipe->>'source_name',
    v_recipe->>'credits_text',
    v_recipe->>'license',
    (v_recipe->>'ready_in_minutes')::int,
    (v_recipe->>'servings')::int,
    (v_recipe->>'health_score')::numeric,
    v_recipe->>'image_type',
    v_recipe->>'spoonacular_source_url',
    (v_recipe->>'preparation_minutes')::int,
    (v_recipe->>'cooking_minutes')::int,
    v_recipe->>'summary',
    v_recipe->>'instructions',
    v_recipe->>'language',
    v_recipe->>'original_id',
    v_recipe->>'gaps',
    (v_recipe->>'aggregate_likes')::int,
    (v_recipe->>'spoonacular_score')::numeric,
    (v_recipe->>'price_per_serving_cents')::numeric,
    (v_recipe->>'weight_watcher_smart_points')::int,
    (v_recipe->>'caloric_percent_protein')::numeric,
    (v_recipe->>'caloric_percent_fat')::numeric,
    (v_recipe->>'caloric_percent_carbs')::numeric,
    (v_recipe->>'weight_per_serving_amount')::numeric,
    v_recipe->>'weight_per_serving_unit',
    coalesce((v_recipe->>'vegetarian')::boolean, false),
    coalesce((v_recipe->>'vegan')::boolean, false),
    coalesce((v_recipe->>'gluten_free')::boolean, false),
    coalesce((v_recipe->>'dairy_free')::boolean, false),
    coalesce((v_recipe->>'very_healthy')::boolean, false),
    coalesce((v_recipe->>'cheap')::boolean, false),
    coalesce((v_recipe->>'very_popular')::boolean, false),
    coalesce((v_recipe->>'sustainable')::boolean, false),
    coalesce((v_recipe->>'low_fodmap')::boolean, false),
    coalesce((v_recipe->>'ketogenic')::boolean, false),
    coalesce((v_recipe->>'whole30')::boolean, false),
    coalesce(v_recipe->'raw_payload', '{}'::jsonb),
    coalesce((v_recipe->>'is_complete')::boolean, false),
    now()
  )
  on conflict (external_id) do update set
    title = excluded.title, image_url = excluded.image_url, source_url = excluded.source_url,
    source_name = excluded.source_name, credits_text = excluded.credits_text, license = excluded.license,
    ready_in_minutes = excluded.ready_in_minutes, servings = excluded.servings, health_score = excluded.health_score,
    image_type = excluded.image_type, spoonacular_source_url = excluded.spoonacular_source_url,
    preparation_minutes = excluded.preparation_minutes, cooking_minutes = excluded.cooking_minutes,
    summary = excluded.summary, instructions = excluded.instructions, language = excluded.language,
    original_id = excluded.original_id, gaps = excluded.gaps, aggregate_likes = excluded.aggregate_likes,
    spoonacular_score = excluded.spoonacular_score, price_per_serving_cents = excluded.price_per_serving_cents,
    weight_watcher_smart_points = excluded.weight_watcher_smart_points,
    caloric_percent_protein = excluded.caloric_percent_protein, caloric_percent_fat = excluded.caloric_percent_fat,
    caloric_percent_carbs = excluded.caloric_percent_carbs,
    weight_per_serving_amount = excluded.weight_per_serving_amount, weight_per_serving_unit = excluded.weight_per_serving_unit,
    vegetarian = excluded.vegetarian, vegan = excluded.vegan, gluten_free = excluded.gluten_free,
    dairy_free = excluded.dairy_free, very_healthy = excluded.very_healthy, cheap = excluded.cheap,
    very_popular = excluded.very_popular, sustainable = excluded.sustainable, low_fodmap = excluded.low_fodmap,
    ketogenic = excluded.ketogenic, whole30 = excluded.whole30, raw_payload = excluded.raw_payload,
    is_complete = excluded.is_complete, updated_at = now()
  returning r.id, (r.xmax = 0) into v_recipe_id, v_inserted;

  delete from recipe_ingredients           where recipe_id = v_recipe_id;
  delete from recipe_nutrients             where recipe_id = v_recipe_id;
  delete from recipe_nutrition_properties  where recipe_id = v_recipe_id;
  delete from recipe_flavonoids            where recipe_id = v_recipe_id;
  delete from recipe_nutrition_ingredients where recipe_id = v_recipe_id;
  delete from recipe_instruction_groups    where recipe_id = v_recipe_id;
  delete from recipe_tags                  where recipe_id = v_recipe_id;

  insert into recipe_nutrients (recipe_id, name, amount, unit, percent_of_daily_needs)
  select v_recipe_id, e->>'name', (e->>'amount')::numeric, e->>'unit', (e->>'percent_of_daily_needs')::numeric
  from jsonb_array_elements(coalesce(payload->'nutrients','[]'::jsonb)) e;

  insert into recipe_nutrition_properties (recipe_id, name, amount, unit)
  select v_recipe_id, e->>'name', (e->>'amount')::numeric, e->>'unit'
  from jsonb_array_elements(coalesce(payload->'nutrition_properties','[]'::jsonb)) e;

  insert into recipe_flavonoids (recipe_id, name, amount, unit)
  select v_recipe_id, e->>'name', (e->>'amount')::numeric, e->>'unit'
  from jsonb_array_elements(coalesce(payload->'flavonoids','[]'::jsonb)) e;

  insert into recipe_tags (recipe_id, tag_type, value)
  select v_recipe_id, e->>'tag_type', e->>'value'
  from jsonb_array_elements(coalesce(payload->'tags','[]'::jsonb)) e;

  for v_ing in select * from jsonb_array_elements(coalesce(payload->'ingredients','[]'::jsonb)) loop
    insert into recipe_ingredients
      (recipe_id, spoonacular_ingredient_id, name, name_clean, original, amount, unit, aisle, image,
       sort_order, consistency, original_name, meta)
    values
      (v_recipe_id, (v_ing->>'spoonacular_ingredient_id')::bigint, v_ing->>'name', v_ing->>'name_clean',
       v_ing->>'original', (v_ing->>'amount')::numeric, v_ing->>'unit', v_ing->>'aisle', v_ing->>'image',
       (v_ing->>'sort_order')::int, v_ing->>'consistency', v_ing->>'original_name', v_ing->'meta')
    returning id into v_ing_id;

    insert into recipe_ingredient_measures (recipe_ingredient_id, system, amount, unit_short, unit_long)
    select v_ing_id, m->>'system', (m->>'amount')::numeric, m->>'unit_short', m->>'unit_long'
    from jsonb_array_elements(coalesce(v_ing->'measures','[]'::jsonb)) m;
  end loop;

  for v_ni in select * from jsonb_array_elements(coalesce(payload->'nutrition_ingredients','[]'::jsonb)) loop
    insert into recipe_nutrition_ingredients (recipe_id, spoonacular_ingredient_id, name, amount, unit, sort_order)
    values (v_recipe_id, (v_ni->>'spoonacular_ingredient_id')::bigint, v_ni->>'name',
            (v_ni->>'amount')::numeric, v_ni->>'unit', (v_ni->>'sort_order')::int)
    returning id into v_ni_id;

    insert into recipe_nutrition_ingredient_nutrients
      (recipe_nutrition_ingredient_id, name, amount, unit, percent_of_daily_needs)
    select v_ni_id, n->>'name', (n->>'amount')::numeric, n->>'unit', (n->>'percent_of_daily_needs')::numeric
    from jsonb_array_elements(coalesce(v_ni->'nutrients','[]'::jsonb)) n;
  end loop;

  for v_grp in select * from jsonb_array_elements(coalesce(payload->'instruction_groups','[]'::jsonb)) loop
    insert into recipe_instruction_groups (recipe_id, name, sort_order)
    values (v_recipe_id, v_grp->>'name', (v_grp->>'sort_order')::int)
    returning id into v_grp_id;

    for v_step in select * from jsonb_array_elements(coalesce(v_grp->'steps','[]'::jsonb)) loop
      insert into recipe_instruction_steps
        (instruction_group_id, step_number, step_text, length_number, length_unit, sort_order)
      values (v_grp_id, (v_step->>'step_number')::int, v_step->>'step_text',
              (v_step->>'length_number')::int, v_step->>'length_unit', (v_step->>'sort_order')::int)
      returning id into v_step_id;

      insert into recipe_instruction_step_ingredients
        (instruction_step_id, spoonacular_ingredient_id, name, localized_name, image)
      select v_step_id, (si->>'spoonacular_ingredient_id')::bigint, si->>'name', si->>'localized_name', si->>'image'
      from jsonb_array_elements(coalesce(v_step->'step_ingredients','[]'::jsonb)) si;

      insert into recipe_instruction_step_equipment
        (instruction_step_id, spoonacular_equipment_id, name, localized_name, image)
      select v_step_id, (se->>'spoonacular_equipment_id')::bigint, se->>'name', se->>'localized_name', se->>'image'
      from jsonb_array_elements(coalesce(v_step->'step_equipment','[]'::jsonb)) se;
    end loop;
  end loop;

  return jsonb_build_object('recipe_id', v_recipe_id, 'inserted', v_inserted);
end;
$$;

revoke all on function import_recipe_graph(jsonb) from public, anon, authenticated;
grant execute on function import_recipe_graph(jsonb) to service_role;
