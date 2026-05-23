---
title: "spoonacular recipe and food API"
source: "https://spoonacular.com/food-api/docs#Equipment"
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

## Cooking and Eating Equipment

Every API endpoint asking for a `equipment` parameter can be fed with any of these cooking equipments.

- skimmer
- pie form
- glass baking pan
- garlic press
- meat grinder
- tongs
- bread knife
- tajine pot
- wire rack
- mincing knife
- cherry pitter
- wooden skewers
- kitchen scissors
- blow torch
- broiler pan
- heart shaped silicone form
- grill
- immersion blender
- baking sheet
- oven mitt
- pastry bag
- palette knife
- pizza cutter
- bottle opener
- bowl
- pizza pan
- candy thermometer
- rolling pin
- frying pan
- casserole dish
- plastic wrap
- salad spinner
- broiler
- silicone muffin tray
- meat tenderizer
- edible cake image
- measuring spoon
- kitchen thermometer
- sifter
- muffin tray
- chocolate mold
- kitchen towels
- potato ricer
- silicone kugelhopf pan
- offset spatula
- cheesecloth
- lemon squeezer
- cake form
- mini muffin tray
- carving fork
- egg slicer
- ice cube tray
- corkscrew
- ice cream machine
- sieve
- kugelhopf pan
- pastry brush
- popsicle sticks
- spatula
- cake server
- poultry shears
- box grater
- cupcake toppers
- funnel
- drinking straws
- slotted spoon
- ceramic pie form
- pepper grinder
- mortar and pestle
- baster
- melon baller
- zester
- pastry cutter
- ziploc bags
- aluminum foil
- toothpicks
- pot
- baking pan
- ladle
- apple cutter
- fillet knife
- toaster
- heart shaped cake form
- grill pan
- wooden spoon
- paper towels
- cookie cutter
- tart form
- pizza board
- glass casserole dish
- madeleine form
- metal skewers
- microplane
- stand mixer
- whisk
- mixing bowl
- deep fryer
- canning jar
- cheese knife
- hand mixer
- butter curler
- food processor
- wax paper
- grater
- gravy boat
- muffin liners
- butter knife
- waffle iron
- double boiler
- can opener
- mandoline
- kitchen twine
- juicer
- wok
- measuring cup
- ramekin
- airfryer
- instant pot
- spoon
- dough scraper
- microwave
- roasting pan
- pressure cooker
- dehydrator
- baking paper
- silicone muffin liners
- loaf pan
- cake topper
- dutch oven
- baking spatula
- popsicle molds
- teapot
- cocktail sticks
- cleaver
- rice cooker
- bread machine
- fork
- ice cream scoop
- slow cooker
- knife
- kitchen scale
- griddle
- frosting cake topper
- cutting board
- cake pop mold
- oven
- colander
- kitchen timer
- panini press
- pasta machine
- popcorn maker
- lollipop sticks
- steamer basket
- chopsticks
- chefs knife
- blender
- pizza stone
- skewers
- sauce pan
- peeler
- stove
- pot holder
- springform pan
- apple corer
- potato masher
- serrated knife

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