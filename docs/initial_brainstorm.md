# Initial Brainstorm

## Basic Idea

> This is an app for couples. In the app each person is present a card stack of recipes that they each swipe right or left(tinder style) with right being like and left being dislike. If each person swipes right on the same recipe it's a match! The goal is instead of waiting until each other get's off work to ask the fabled question "What do you want to eat for dinner?" We provide the users a fun, easy and cute way to see what their partners in the mood for and to provide them the same information. One user invites the other to pod and in that pod we'll have a live session that the couple can swipe right or left on recipes. Recipes matched on will be saved to their shared cookbook. For each recipe there's an ingredient list where users in the pod can add or remove ingredients they have, saving or removing items from a shared shopping list. There should also be a filter section that's specific to each user, not shared, to filter out dietary restrictions or intolerances.

## Recipe Data

I plan to seed the recipes myself for now. The file `setup-spoon-cron.sh` has created a cron job to run this powershell script every hour `test-spoon.ps1`. That script queries `Spoonacular` api using their get random recipe endpoint `docs/spoonacular_api_docs/Get Random Recipes.md`. And saves that recipe in `RecipeJson` directory. Since we're using spoonacular free tier it's ran every hour to not get rate limited

## Database

I have a local supabase instance going `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` I think the plan would be to modify the cron job workflow to also kick off another script that imports new recipes in the supabase db. There's nothing in the supabase so all of that has to be built out. Use this recipe to analyze for schema `RecipeJson/Best_Buffalo_Chicken_Chili.json`

## Sys arc

It will be a mobile app expo react native is all I have now need to figure out the best stack, especially the websocket situation. I want to use the latest expo and expo router.  Since it's a shared sesson I would imagine websocket would be the best choice, but is there is a more modern solution I want to know. Should enforce TDD standards with 90% code coverage.

## Auth

I have clerk setup and a pro account.