// Unit tests for the Spoonacular → DB normalizer.
// Uses real fixture files in RecipeJson/ so regressions on actual payload shapes
// are caught — Spoonacular drifts and minor field renames have bitten before.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  NormalizationError,
  normalizeSpoonPayload,
  normalizeSpoonRecipe,
  titleSimilarity,
} from '../normalize';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BUFFALO_FIXTURE = path.join(REPO_ROOT, 'RecipeJson', 'Best_Buffalo_Chicken_Chili.json');
const ALMOND_FIXTURE = path.join(REPO_ROOT, 'RecipeJson', 'Almond_Horns.json');
const BEEF_FIXTURE = path.join(REPO_ROOT, 'RecipeJson', 'Beef_Braised_In_Red_Wine.json');

describe('normalizeSpoonPayload (Best_Buffalo_Chicken_Chili.json fixture)', () => {
  let payload: unknown;

  beforeAll(async () => {
    payload = JSON.parse(await fs.readFile(BUFFALO_FIXTURE, 'utf8'));
  });

  it('maps top-level recipe fields and retained dietary flags correctly', () => {
    const { recipe, nutrients } = normalizeSpoonPayload(payload);
    expect(recipe.external_id).toBe(634888);
    expect(recipe.title).toBe('Best Buffalo Chicken Chili');
    expect(recipe.image_url).toBe('https://img.spoonacular.com/recipes/634888-556x370.jpg');
    expect(recipe.source_name).toBe('Foodista');
    expect(recipe.license).toBe('CC BY 3.0');
    expect(recipe.ready_in_minutes).toBe(45);
    expect(recipe.servings).toBe(10);
    expect(recipe.health_score).toBe(39);
    expect(recipe.gluten_free).toBe(true);
    expect(recipe.dairy_free).toBe(true);
    expect(recipe.vegetarian).toBe(false);
    expect(recipe.vegan).toBe(false);
    expect(recipe.dietary_flags).toMatchObject({
      vegetarian: false,
      vegan: false,
      glutenFree: true,
      dairyFree: true,
    });
    expect(nutrients).toContainEqual(
      expect.objectContaining({ name: 'Calories', amount: 298.62, unit: 'kcal' }),
    );
  });

  it('marks the recipe as is_complete when image + ingredients + steps + Calories are present', () => {
    const { recipe } = normalizeSpoonPayload(payload);
    expect(recipe.is_complete).toBe(true);
  });

  it('preserves the original raw payload for client-side hydration', () => {
    const { recipe } = normalizeSpoonPayload(payload);
    expect(recipe.raw_payload).toMatchObject({ id: 634888, title: 'Best Buffalo Chicken Chili' });
  });

  it('emits ingredients in source order with stable positions', () => {
    const { ingredients } = normalizeSpoonPayload(payload);
    expect(ingredients.length).toBeGreaterThan(0);
    expect(ingredients[0]!.position).toBe(0);
    expect(ingredients[0]!.name).toBe('black beans');
    expect(ingredients[0]!.ext_ingredient_id).toBe(16015);
    expect(ingredients[0]!.unit).toBe('oz');
    // Positions must be a dense ascending sequence — the deck UI relies on this.
    for (let i = 0; i < ingredients.length; i++) {
      expect(ingredients[i]!.position).toBe(i);
    }
  });

  it('deduplicates ingredients by ext_ingredient_id within a recipe', () => {
    const raw = {
      id: 1,
      title: 'Dedup Test',
      image: 'https://x',
      analyzedInstructions: [{ steps: [{ step: 'do it' }] }],
      nutrition: { nutrients: [{ name: 'Calories', amount: 1, unit: 'kcal' }] },
      extendedIngredients: [
        { id: 100, name: 'salt' },
        { id: 100, name: 'salt' },
        { id: 200, name: 'pepper' },
      ],
    };
    const { ingredients } = normalizeSpoonRecipe(raw);
    expect(ingredients).toHaveLength(2);
    expect(ingredients.map((i) => i.position)).toEqual([0, 1]);
  });
});

describe('normalizeSpoonPayload (Almond_Horns.json fixture)', () => {
  let payload: unknown;

  beforeAll(async () => {
    payload = JSON.parse(await fs.readFile(ALMOND_FIXTURE, 'utf8'));
  });

  it('maps expanded top-level scalar recipe columns', () => {
    const { recipe } = normalizeSpoonPayload(payload);
    expect(recipe.image_type).toBe('jpg');
    expect(recipe.spoonacular_source_url).toBe('https://spoonacular.com/almond-horns-632140');
    expect(recipe.preparation_minutes).toBeNull();
    expect(recipe.cooking_minutes).toBeNull();
    expect(recipe.aggregate_likes).toBe(15);
    expect(recipe.spoonacular_score).toBeCloseTo(20.27, 2);
    expect(recipe.weight_watcher_smart_points).toBe(250);
    expect(recipe.gaps).toBe('no');
    expect(recipe.price_per_serving_cents).toBe(3207.12);
    expect(recipe.language).toBe('en');
    expect(recipe.summary).toContain('Almond Horns');
    expect(recipe.instructions).toContain('<ol>');
    expect(recipe.original_id).toBeNull();
    expect(recipe.caloric_percent_protein).toBe(12.23);
    expect(recipe.caloric_percent_fat).toBe(62.02);
    expect(recipe.caloric_percent_carbs).toBe(25.75);
    expect(recipe.weight_per_serving_amount).toBe(1519);
    expect(recipe.weight_per_serving_unit).toBe('g');
  });

  it('maps expanded ingredient fields and measures', () => {
    const { ingredients } = normalizeSpoonPayload(payload);
    expect(ingredients[0]).toMatchObject({
      ext_ingredient_id: 1002050,
      name: 'almond extract',
      consistency: 'LIQUID',
      original_name: 'almond extract',
      meta: [],
    });
    expect(ingredients[0]!.measures).toContainEqual({
      system: 'us',
      amount: 3,
      unit_short: 'Tbsps',
      unit_long: 'Tbsps',
    });
    expect(ingredients[0]!.measures).toContainEqual(expect.objectContaining({ system: 'metric' }));
  });

  it('maps nutrients, nutrition properties, flavonoids, and nutrition ingredients', () => {
    const { nutrients, nutritionProperties, flavonoids, nutritionIngredients } =
      normalizeSpoonPayload(payload);
    expect(nutrients.length).toBeGreaterThan(0);
    expect(nutrients[0]).toEqual({
      name: 'Calories',
      amount: 7260.92,
      unit: 'kcal',
      percent_of_daily_needs: 363.05,
    });
    expect(nutritionProperties[0]).toMatchObject({ name: 'Glycemic Index' });
    expect(flavonoids[0]).toMatchObject({ name: 'Cyanidin' });
    expect(nutritionIngredients[0]).toMatchObject({
      spoonacular_ingredient_id: 1002050,
      name: 'almond extract',
      sort_order: 0,
    });
    expect(nutritionIngredients[0]!.nutrients).toContainEqual(
      expect.objectContaining({ name: 'Potassium' }),
    );
  });

  it('maps structured instruction groups with step refs and lengths', () => {
    const { instructionGroups } = normalizeSpoonPayload(payload);
    expect(instructionGroups[0]!.sort_order).toBe(0);
    expect(instructionGroups[0]!.steps[0]).toMatchObject({
      step_number: 1,
      length_number: 1,
      length_unit: 'minutes',
      sort_order: 0,
    });
    expect(instructionGroups[0]!.steps[0]!.step_text.startsWith('(*) To blanch almonds')).toBe(
      true,
    );
    expect(instructionGroups[0]!.steps[0]!.step_ingredients[0]).toEqual({
      spoonacular_ingredient_id: 12061,
      name: 'almonds',
      localized_name: 'almonds',
      image: 'almonds.jpg',
    });
  });

  it('maps tags while skipping empty cuisine arrays', () => {
    const { tags } = normalizeSpoonPayload(payload);
    expect(tags.some((tag) => tag.tag_type === 'cuisine')).toBe(false);
    expect(tags).toContainEqual({ tag_type: 'dish_type', value: 'lunch' });
    expect(tags).toContainEqual({ tag_type: 'diet', value: 'gluten free' });
  });
});

describe('normalizeSpoonPayload (Beef_Braised_In_Red_Wine.json fixture)', () => {
  it('maps step equipment and tolerates empty step ingredient refs', async () => {
    const payload = JSON.parse(await fs.readFile(BEEF_FIXTURE, 'utf8')) as unknown;
    const { instructionGroups } = normalizeSpoonPayload(payload);
    const step = instructionGroups
      .flatMap((group) => group.steps)
      .find((candidate) => candidate.step_equipment[0]?.name === 'oven');
    expect(step?.step_equipment[0]).toMatchObject({
      spoonacular_equipment_id: 404784,
      name: 'oven',
    });
    expect(step?.step_ingredients).toEqual([]);
  });
});

describe('normalizeSpoonRecipe (missing fields)', () => {
  it('marks is_complete=false when instructions are missing', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'No Instructions',
      image: 'https://x',
      nutrition: { nutrients: [{ name: 'Calories', amount: 1, unit: 'kcal' }] },
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('marks is_complete=false when image is missing', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'No Image',
      analyzedInstructions: [{ steps: [{ step: 'do it' }] }],
      nutrition: { nutrients: [{ name: 'Calories', amount: 1, unit: 'kcal' }] },
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('marks is_complete=false when ingredients are missing', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'No Ingredients',
      image: 'https://x',
      analyzedInstructions: [{ steps: [{ step: 'do it' }] }],
      nutrition: { nutrients: [{ name: 'Calories', amount: 1, unit: 'kcal' }] },
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('marks is_complete=false for plain instructions without structured steps', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'Plain Only',
      image: 'https://x',
      instructions: 'do it',
      nutrition: { nutrients: [{ name: 'Calories', amount: 1, unit: 'kcal' }] },
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('marks is_complete=false when structured steps have no Calories nutrient', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'No Calories',
      image: 'https://x',
      analyzedInstructions: [{ steps: [{ step: 'do it' }] }],
      nutrition: { nutrients: [{ name: 'Fat', amount: 1, unit: 'g' }] },
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('marks is_complete=true when structured steps and Calories are present', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'Analyzed Only',
      image: 'https://x',
      analyzedInstructions: [{ steps: [{ step: 'do it' }] }],
      nutrition: { nutrients: [{ name: 'Calories', amount: 1, unit: 'kcal' }] },
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(true);
  });

  it('tolerates missing optional graph branches as empty arrays', () => {
    const result = normalizeSpoonRecipe({
      id: 1,
      title: 'Minimal Graph',
      image: 'https://x',
      extendedIngredients: [{ id: 1, name: 'salt' }],
      analyzedInstructions: [{ steps: [{ number: 1, step: 'x' }] }],
      nutrition: { nutrients: [{ name: 'Calories', amount: 1, unit: 'kcal' }] },
    });
    expect(result.recipe.is_complete).toBe(true);
    expect(result.nutritionProperties).toEqual([]);
    expect(result.flavonoids).toEqual([]);
    expect(result.nutritionIngredients).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.ingredients[0]!.measures).toEqual([]);
  });

  it('throws on missing id / title', () => {
    expect(() => normalizeSpoonRecipe({ title: 'no id' })).toThrow(NormalizationError);
    expect(() => normalizeSpoonRecipe({ id: 1 })).toThrow(NormalizationError);
  });

  it('throws on empty payloads', () => {
    expect(() => normalizeSpoonPayload(null)).toThrow(NormalizationError);
    expect(() => normalizeSpoonPayload({})).toThrow(NormalizationError);
    expect(() => normalizeSpoonPayload({ recipes: [] })).toThrow(NormalizationError);
  });
});

describe('normalizeSpoonPayload tags (Best_Buffalo_Chicken_Chili.json fixture)', () => {
  it('orders cuisine tags before dish type, diet, and occasion tags', async () => {
    const payload = JSON.parse(await fs.readFile(BUFFALO_FIXTURE, 'utf8')) as unknown;
    const { tags } = normalizeSpoonPayload(payload);
    expect(tags).toContainEqual({ tag_type: 'cuisine', value: 'American' });
    expect(tags).toContainEqual({ tag_type: 'dish_type', value: 'soup' });
    expect(tags).toContainEqual({ tag_type: 'diet', value: 'gluten free' });
    expect(tags.map((tag) => tag.tag_type)).toEqual([
      'cuisine',
      'dish_type',
      'dish_type',
      'dish_type',
      'dish_type',
      'dish_type',
      'diet',
      'diet',
      'occasion',
    ]);
  });
});

describe('titleSimilarity', () => {
  it('returns 1 for identical titles', () => {
    expect(titleSimilarity('Best Buffalo Chicken Chili', 'Best Buffalo Chicken Chili')).toBe(1);
  });

  it('returns ≥0.85 for near-duplicate titles', () => {
    expect(
      titleSimilarity('Best Buffalo Chicken Chili', 'best buffalo chicken chili!'),
    ).toBeGreaterThanOrEqual(0.85);
    expect(titleSimilarity('Baked Rigatoni', 'Baked Rigatoni Pasta')).toBeGreaterThanOrEqual(0.7);
  });

  it('returns ≤0.5 for clearly different titles', () => {
    expect(titleSimilarity('Best Buffalo Chicken Chili', 'Pulled Pork Nachos')).toBeLessThan(0.5);
  });

  it('handles short strings without crashing', () => {
    expect(titleSimilarity('', '')).toBe(1);
    expect(titleSimilarity('a', 'a')).toBe(1);
    expect(titleSimilarity('a', 'b')).toBe(0);
  });
});
