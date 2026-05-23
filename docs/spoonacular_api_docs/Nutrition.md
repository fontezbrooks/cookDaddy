---
title: "spoonacular recipe and food API"
source: "https://spoonacular.com/food-api/docs#Nutrition"
author:
  - "[[David Urbansky]]"
published:
created: 2026-05-21
description: "The only food API you'll ever need. Our knowledge engineers spent years crafting our complex food ontology, which allows us to understand the relationships between ingredients, recipes, nutrition, allergens, and more. We understand 'nut free' muffins can't contain pecans (even if the recipe doesn't mention 'nuts' anywhere!) and we automatically determine that a recipe with Worcestershire sauce isn't vegetarian (we're looking at you, anchovies.)"
tags:
  - "clippings"
---
## Documentation

Here you have detailed documentation of all available API functions. To get started, you can make the sample request for each endpoint, [download an SDK](https://spoonacular.com/food-api/sdk), or run the examples in [Postman](https://spoonacular.com/food-api/sdk).

## Nutrition

Food objects (whole foods, recipes, grocery products, menu items) have nutrition. Endpoints that expose nutritional information group nutrition into three categories: Nutrients (Macro and Micro), Food Properties, and Flavonoids.

### Nutrients - Macro and Micro Nutrients

- Calories (in kcal)
- Fat (in g)
- Trans Fat (in g)
- Saturated Fat (in g)
- Mono Unsaturated Fat (in g)
- Poly Unsaturated Fat (in g)
- Protein (in g)
- Cholesterol (in mg)
- Carbohydrates (in g)
- Net Carbohydrates (in g)
- Alcohol (in g)
- Fiber (in g)
- Sugar (in g)
- Sodium (in mg)
- Caffein (in mg)
- Manganese (in mg)
- Potassium (in mg)
- Magnesium (in mg)
- Calcium (in mg)
- Copper (in mg)
- Zinc (in mg)
- Phosphorus (in mg)
- Fluoride (in mg)
- Choline (in mg)
- Iron (in mg)
- Vitamin A (in IU)
- Vitamin B1 (in mg)
- Vitamin B2 (in mg)
- Vitamin B3 (in mg)
- Vitamin B5 (in mg)
- Vitamin B6 (in mg)
- Vitamin B12 (in Âµg)
- Vitamin C (in mg)
- Vitamin D (in Âµg)
- Vitamin E (in mg)
- Vitamin K (in Âµg)
- Folate (in Âµg)
- Folic Acid (in Âµg)
- Iodine (in Âµg)
- Selenium (in Âµg)

### Food Properties

- Glycemic Index
- Glycemic Load

### Flavonoids

Flavonoids are food compounds called phytonutrients, which are found in many plants (fruit and vegetables) that have multiple health benefits.

- Cyanidin (in mg)
- Petunidin (in mg)
- Delphinidin (in mg)
- Malvidin (in mg)
- Pelargonidin (in mg)
- Peonidin (in mg)
- Catechin (in mg)
- Epigallocatechin (in mg)
- Epicatechin (in mg)
- Epicatechin 3-gallate (in mg)
- Epigallocatechin 3-gallate (in mg)
- Theaflavin (in mg)
- Theaflavin-3,3'-digallate (in mg)
- Theaflavin-3'-gallate (in mg)
- Theaflavin-3-gallate (in mg)
- Thearubigins (in mg)
- Eriodictyol (in mg)
- Hesperetin (in mg)
- Naringenin (in mg)
- Apigenin (in mg)
- Luteolin (in mg)
- Isorhamnetin (in mg)
- Kaempferol (in mg)
- Myricetin (in mg)
- Quercetin (in mg)
- Gallocatechin (in mg)

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