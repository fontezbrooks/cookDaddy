---
title: "spoonacular recipe and food API"
source: "https://spoonacular.com/food-api/docs#Cuisines"
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

## Cuisines

Every API endpoint asking for a `cuisine` parameter can be fed with any of these cuisines.

- African
- Asian
- American
- British
- Cajun
- Caribbean
- Chinese
- Eastern European
- European
- French
- German
- Greek
- Indian
- Irish
- Italian
- Japanese
- Jewish
- Korean
- Latin American
- Mediterranean
- Mexican
- Middle Eastern
- Nordic
- Southern
- Spanish
- Thai
- Vietnamese

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