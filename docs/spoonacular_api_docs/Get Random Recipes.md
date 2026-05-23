---
title: "spoonacular recipe and food API"
source: "https://spoonacular.com/food-api/docs#Get-Random-Recipes"
author:
  - "[[David Urbansky]]"
published:
created: 2026-05-21
description: "The only food API you'll ever need. Our knowledge engineers spent years crafting our complex food ontology, which allows us to understand the relationships between ingredients, recipes, nutrition, allergens, and more. We understand 'nut free' muffins can't contain pecans (even if the recipe doesn't mention 'nuts' anywhere!) and we automatically determine that a recipe with Worcestershire sauce isn't vegetarian (we're looking at you, anchovies.)"
tags:
  - "clippings"
---


## Get Random Recipes

Find random (popular) recipes. If you need to filter recipes by diet, nutrition etc. you might want to consider using the complex recipe search endpoint and set the `sort` request parameter to `random`.

GET

https://api.spoonacular.com/recipes/random

#### Headers

Response Headers:

- `Content-Type: application/json`

#### Parameters

| Name | Type | Example | Description |
| --- | --- | --- | --- |
| `includeNutrition` | boolean | true | Whether to include nutritional information to returned recipes. |
| `include-tags` | string | vegetarian, dessert | The tags (can be diets, meal types, cuisines, or intolerances) that the recipe must have. |
| `exclude-tags` | string | dairy | The tags (can be diets, meal types, cuisines, or intolerances) that the recipe must NOT have. |
| `number` | number | 1 | The number of random recipes to be returned (between 1 and 100). |

GET

https://api.spoonacular.com/recipes/random?number=1&include-tags=vegetarian,dessert&exclude-tags=quinoa

```json
{
    "recipes":[
        {/* recipe data as in Get Recipe Information endpoint */}
    ]
}
```

#### Quotas

Calling this endpoint requires

1 point

and

0.01 points

per recipe returned and

0.5 points

per recipe returned if `includeNutrition` is set to true. Learn more about [quotas](#Quotas).

#### Need Help? Just ask!

Ask AI

Hi! How can I help you today?

For the get random recipe endpoint how would I filter out seafood using exclude-tags or otherwise?