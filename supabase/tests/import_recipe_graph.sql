-- Source: docs/DATABASE_REFACTOR/DESIGN/README.md §8 + WORKFLOW B2.
-- pgTAP coverage for the atomic import_recipe_graph RPC.

begin;
select plan(23);

select tests.seed_three_users();
select tests.as_service();

select public.import_recipe_graph(
  '{
    "recipe": {
      "external_id": 999001,
      "title": "Atomic Graph Chili",
      "image_url": "https://example.test/chili.jpg",
      "source_url": "https://example.test/source",
      "source_name": "Example Kitchen",
      "credits_text": "Example Author",
      "license": "CC-BY",
      "ready_in_minutes": 45,
      "servings": 4,
      "health_score": 72,
      "image_type": "jpg",
      "spoonacular_source_url": "https://spoonacular.test/999001",
      "preparation_minutes": 15,
      "cooking_minutes": 30,
      "summary": "A complete recipe graph fixture.",
      "instructions": "Cook it.",
      "language": "en",
      "original_id": "orig-999001",
      "gaps": "no",
      "aggregate_likes": 88,
      "spoonacular_score": 91.25,
      "price_per_serving_cents": 245.5,
      "weight_watcher_smart_points": 7,
      "caloric_percent_protein": 25,
      "caloric_percent_fat": 35,
      "caloric_percent_carbs": 40,
      "weight_per_serving_amount": 380,
      "weight_per_serving_unit": "g",
      "vegetarian": false,
      "vegan": false,
      "gluten_free": true,
      "dairy_free": true,
      "very_healthy": true,
      "cheap": false,
      "very_popular": true,
      "sustainable": false,
      "low_fodmap": false,
      "ketogenic": false,
      "whole30": false,
      "raw_payload": {"id": 999001, "title": "Atomic Graph Chili"},
      "is_complete": true
    },
    "ingredients": [
      {
        "spoonacular_ingredient_id": 16015,
        "name": "black beans",
        "name_clean": "black beans",
        "original": "1 can black beans",
        "amount": 1,
        "unit": "can",
        "aisle": "Canned and Jarred",
        "image": "black-beans.jpg",
        "sort_order": 0,
        "consistency": "solid",
        "original_name": "black beans",
        "meta": ["drained"],
        "measures": [
          {"system": "us", "amount": 1, "unit_short": "can", "unit_long": "can"},
          {"system": "metric", "amount": 425, "unit_short": "g", "unit_long": "grams"}
        ]
      },
      {
        "spoonacular_ingredient_id": 11819,
        "name": "red chili",
        "name_clean": "red chili",
        "original": "1 red chili",
        "amount": 1,
        "unit": "",
        "aisle": "Produce",
        "image": "chili.jpg",
        "sort_order": 1,
        "consistency": "solid",
        "original_name": "red chili",
        "meta": [],
        "measures": []
      }
    ],
    "nutrients": [
      {"name": "Calories", "amount": 330, "unit": "kcal", "percent_of_daily_needs": 16.5}
    ],
    "nutrition_properties": [
      {"name": "Glycemic Index", "amount": 22, "unit": ""}
    ],
    "flavonoids": [
      {"name": "Cyanidin", "amount": 0.5, "unit": "mg"}
    ],
    "nutrition_ingredients": [
      {
        "spoonacular_ingredient_id": 16015,
        "name": "black beans",
        "amount": 1,
        "unit": "can",
        "sort_order": 0,
        "nutrients": [
          {"name": "Fiber", "amount": 9, "unit": "g", "percent_of_daily_needs": 32}
        ]
      }
    ],
    "instruction_groups": [
      {
        "name": "Main",
        "sort_order": 0,
        "steps": [
          {
            "step_number": 1,
            "step_text": "Simmer the beans.",
            "length_number": 30,
            "length_unit": "minutes",
            "sort_order": 0,
            "step_ingredients": [
              {"spoonacular_ingredient_id": 16015, "name": "black beans", "localized_name": "black beans", "image": "black-beans.jpg"}
            ],
            "step_equipment": [
              {"spoonacular_equipment_id": 404752, "name": "pot", "localized_name": "pot", "image": "pot.jpg"}
            ]
          }
        ]
      }
    ],
    "tags": [
      {"tag_type": "cuisine", "value": "American"},
      {"tag_type": "diet", "value": "Gluten Free"}
    ]
  }'::jsonb
) as first_result \gset

select is((:'first_result'::jsonb->>'inserted')::boolean, true, 'first call reports inserted=true');
select is(
  (select external_id from public.recipes where id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  999001::bigint,
  'recipes row exists with bigint external_id'
);
select is(
  (select is_complete from public.recipes where id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  true,
  'recipe is_complete is true'
);
select is(
  (select count(*)::int from public.recipe_ingredients where recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  2,
  'recipe_ingredients count = 2'
);
select is(
  (select concat_ws('|', original, sort_order::text, image, spoonacular_ingredient_id::text)
     from public.recipe_ingredients
    where recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid and sort_order = 0),
  '1 can black beans|0|black-beans.jpg|16015',
  'ingredient 0 stores renamed columns'
);
select is(
  (select count(*)::int
     from public.recipe_ingredient_measures m
     join public.recipe_ingredients i on i.id = m.recipe_ingredient_id
    where i.recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  2,
  'recipe_ingredient_measures count = 2'
);
select is(
  (select count(*)::int from public.recipe_nutrients
    where recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid and name = 'Calories'),
  1,
  'recipe_nutrients has Calories'
);
select is(
  (select count(*)::int from public.recipe_nutrition_ingredients
    where recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  1,
  'recipe_nutrition_ingredients count = 1'
);
select is(
  (select count(*)::int
     from public.recipe_nutrition_ingredient_nutrients n
     join public.recipe_nutrition_ingredients i on i.id = n.recipe_nutrition_ingredient_id
    where i.recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  1,
  'recipe_nutrition_ingredient_nutrients count = 1'
);
select is((select count(*)::int from public.recipe_instruction_groups where recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid), 1,
  'recipe_instruction_groups count = 1');
select is(
  (select count(*)::int
     from public.recipe_instruction_steps s
     join public.recipe_instruction_groups g on g.id = s.instruction_group_id
    where g.recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  1,
  'recipe_instruction_steps count = 1'
);
select is(
  (select count(*)::int
     from public.recipe_instruction_step_ingredients si
     join public.recipe_instruction_steps s on s.id = si.instruction_step_id
     join public.recipe_instruction_groups g on g.id = s.instruction_group_id
    where g.recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  1,
  'recipe_instruction_step_ingredients count = 1'
);
select is(
  (select count(*)::int
     from public.recipe_instruction_step_equipment se
     join public.recipe_instruction_steps s on s.id = se.instruction_step_id
     join public.recipe_instruction_groups g on g.id = s.instruction_group_id
    where g.recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  1,
  'recipe_instruction_step_equipment count = 1'
);
select is((select count(*)::int from public.recipe_tags where recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid), 2,
  'recipe_tags count = 2');

select public.import_recipe_graph(
  jsonb_set(
    (select jsonb_build_object(
      'recipe', jsonb_build_object(
        'external_id', 999001, 'title', 'Atomic Graph Chili', 'image_url', 'https://example.test/chili.jpg',
        'raw_payload', jsonb_build_object('id', 999001, 'title', 'Atomic Graph Chili'), 'is_complete', true
      ),
      'ingredients', jsonb_build_array(
        jsonb_build_object('spoonacular_ingredient_id', 16015, 'name', 'black beans', 'sort_order', 0,
          'original', '1 can black beans', 'image', 'black-beans.jpg',
          'measures', jsonb_build_array(
            jsonb_build_object('system', 'us', 'amount', 1, 'unit_short', 'can', 'unit_long', 'can'),
            jsonb_build_object('system', 'metric', 'amount', 425, 'unit_short', 'g', 'unit_long', 'grams')
          )
        ),
        jsonb_build_object('spoonacular_ingredient_id', 11819, 'name', 'red chili', 'sort_order', 1, 'measures', jsonb_build_array())
      ),
      'nutrients', jsonb_build_array(jsonb_build_object('name', 'Calories', 'amount', 330, 'unit', 'kcal', 'percent_of_daily_needs', 16.5)),
      'nutrition_properties', jsonb_build_array(jsonb_build_object('name', 'Glycemic Index', 'amount', 22, 'unit', '')),
      'flavonoids', jsonb_build_array(jsonb_build_object('name', 'Cyanidin', 'amount', 0.5, 'unit', 'mg')),
      'nutrition_ingredients', jsonb_build_array(
        jsonb_build_object('spoonacular_ingredient_id', 16015, 'name', 'black beans', 'amount', 1, 'unit', 'can', 'sort_order', 0,
          'nutrients', jsonb_build_array(jsonb_build_object('name', 'Fiber', 'amount', 9, 'unit', 'g', 'percent_of_daily_needs', 32))
        )
      ),
      'instruction_groups', jsonb_build_array(
        jsonb_build_object('name', 'Main', 'sort_order', 0, 'steps', jsonb_build_array(
          jsonb_build_object('step_number', 1, 'step_text', 'Simmer the beans.', 'length_number', 30,
            'length_unit', 'minutes', 'sort_order', 0,
            'step_ingredients', jsonb_build_array(jsonb_build_object('spoonacular_ingredient_id', 16015, 'name', 'black beans', 'localized_name', 'black beans', 'image', 'black-beans.jpg')),
            'step_equipment', jsonb_build_array(jsonb_build_object('spoonacular_equipment_id', 404752, 'name', 'pot', 'localized_name', 'pot', 'image', 'pot.jpg'))
          )
        ))
      ),
      'tags', jsonb_build_array(
        jsonb_build_object('tag_type', 'cuisine', 'value', 'American'),
        jsonb_build_object('tag_type', 'diet', 'value', 'Gluten Free')
      )
    )),
    '{recipe,title}',
    '"Atomic Graph Chili"'
  )
) as second_result \gset

select is((:'second_result'::jsonb->>'inserted')::boolean, false, 'second call reports inserted=false');
select is((select count(*)::int from public.recipe_ingredients where recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid), 2,
  'idempotent ingredients count unchanged');
select is(
  (select count(*)::int
     from public.recipe_ingredient_measures m
     join public.recipe_ingredients i on i.id = m.recipe_ingredient_id
    where i.recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  2,
  'idempotent measures count unchanged'
);
select is(
  (select count(*)::int
     from public.recipe_instruction_steps s
     join public.recipe_instruction_groups g on g.id = s.instruction_group_id
    where g.recipe_id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  1,
  'idempotent steps count unchanged'
);
select is(
  (select should_be_complete = is_complete
     from public.recipe_completeness where id = (:'first_result'::jsonb->>'recipe_id')::uuid),
  true,
  'recipe_completeness agrees with recipe is_complete'
);

select public.import_recipe_graph(
  jsonb_set(
    jsonb_build_object(
      'recipe', jsonb_build_object(
        'external_id', 999001, 'title', 'Atomic Graph Chili Updated',
        'image_url', 'https://example.test/chili.jpg',
        'raw_payload', jsonb_build_object('id', 999001, 'title', 'Atomic Graph Chili Updated'),
        'is_complete', true
      ),
      'ingredients', jsonb_build_array(jsonb_build_object('name', 'black beans', 'sort_order', 0)),
      'nutrients', jsonb_build_array(jsonb_build_object('name', 'Calories')),
      'instruction_groups', jsonb_build_array(
        jsonb_build_object('sort_order', 0, 'steps', jsonb_build_array(jsonb_build_object('step_number', 1, 'step_text', 'Simmer.', 'sort_order', 0)))
      )
    ),
    '{recipe,title}',
    '"Atomic Graph Chili Updated"'
  )
) as update_result \gset

select is((:'update_result'::jsonb->>'inserted')::boolean, false, 'update call reports inserted=false');
select is((select title from public.recipes where id = (:'first_result'::jsonb->>'recipe_id')::uuid), 'Atomic Graph Chili Updated',
  'update path changes recipe title');

select ok(
  not has_function_privilege('anon', 'public.import_recipe_graph(jsonb)', 'EXECUTE'),
  'anon cannot execute import_recipe_graph'
);

select ok(
  not has_function_privilege('authenticated', 'public.import_recipe_graph(jsonb)', 'EXECUTE'),
  'authenticated cannot execute import_recipe_graph'
);

select * from finish();
rollback;
