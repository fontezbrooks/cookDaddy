---
title: spoonacular recipe and food API
source: https://spoonacular.com/food-api/docs#Diets
author:
  - "[[David Urbansky]]"
published:
created: 2026-05-21
description: The only food API you'll ever need. Our knowledge engineers spent years crafting our complex food ontology, which allows us to understand the relationships between ingredients, recipes, nutrition, allergens, and more. We understand 'nut free' muffins can't contain pecans (even if the recipe doesn't mention 'nuts' anywhere!) and we automatically determine that a recipe with Worcestershire sauce isn't vegetarian (we're looking at you, anchovies.)
tags:
  - clippings
feature: thumbnails/external/74eeee65d4400a3c720e21d465e13228.png
thumbnail: thumbnails/resized/33f17a5f900ac3ea55f67b880020a7a0_86cf658e.webp
---
## Documentation

Here you have detailed documentation of all available API functions. To get started, you can make the sample request for each endpoint, [download an SDK](https://spoonacular.com/food-api/sdk), or run the examples in [Postman](https://spoonacular.com/food-api/sdk).

## Diet Definitions

Every API endpoint asking for an `diet` parameter can be fed with any of these diets.

#### Gluten Free

Eliminating gluten means avoiding wheat, barley, rye, and other gluten-containing grains and foods made from them (or that may have been cross contaminated).

#### Ketogenic

The keto diet is based more on the ratio of fat, protein, and carbs in the diet rather than specific ingredients. Generally speaking, high fat, protein-rich foods are acceptable and high carbohydrate foods are not. The formula we use is 55-80% fat content, 15-35% protein content, and under 10% of carbohydrates.

#### Vegetarian

No ingredients may contain meat or meat by-products, such as bones or gelatin.

#### Lacto-Vegetarian

All ingredients must be vegetarian and none of the ingredients can be or contain egg.

#### Ovo-Vegetarian

All ingredients must be vegetarian and none of the ingredients can be or contain dairy.

#### Vegan

No ingredients may contain meat or meat by-products, such as bones or gelatin, nor may they contain eggs, dairy, or honey.

#### Pescetarian

Everything is allowed except meat and meat by-products - some pescetarians eat eggs and dairy, some do not.

#### Paleo

Allowed ingredients include meat (especially grass fed), fish, eggs, vegetables, some oils (e.g. coconut and olive oil), and in smaller quantities, fruit, nuts, and sweet potatoes. We also allow honey and maple syrup (popular in Paleo desserts, but strict Paleo followers may disagree). Ingredients not allowed include legumes (e.g. beans and lentils), grains, dairy, refined sugar, and processed foods.

#### Primal

Very similar to Paleo, except dairy is allowed - think raw and full fat milk, butter, ghee, etc.

#### Low FODMAP

FODMAP stands for "fermentable oligo-, di-, mono-saccharides and polyols". Our ontology knows which foods are considered high in these types of carbohydrates (e.g. legumes, wheat, and dairy products)

#### Whole30

Allowed ingredients include meat, fish/seafood, eggs, vegetables, fresh fruit, coconut oil, olive oil, small amounts of dried fruit and nuts/seeds. Ingredients not allowed include added sweeteners (natural and artificial, except small amounts of fruit juice), dairy (except clarified butter or ghee), alcohol, grains, legumes (except green beans, sugar snap peas, and snow peas), and food additives, such as carrageenan, MSG, and sulfites.

![](https://spoonacular.com/application/frontend/images/academy/diet-infographic.png)

See also [the comparison of popular diets](https://spoonacular.com/academy/which-diet-is-best-for-me)

Hi! How can I help you today?

For the get random recipe endpoint how would I filter out seafood using exclude-tags or otherwise?

To filter out seafood recipes when using the Get Random Recipes endpoint, you can use the `exclude-tags` parameter and set it to "seafood". This ensures that recipes tagged as seafood will not be included in the results.  
  
Example of the request URL:
```
GET https://api.spoonacular.com/recipes/random?number=1&exclude-tags=seafood&apiKey=YOUR-API-KEY
```
  
This will return one random recipe that does NOT include seafood.  
  
You can also exclude other tags like diets, meal types, cuisines, or intolerances in a similar manner by comma-separating multiple tags if needed.  
  
For more details, see the official documentation here: \[Get Random Recipes Endpoint\](https://spoonacular.com/food-api/docs#get-random-recipes)