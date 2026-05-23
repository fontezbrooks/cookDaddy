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
const FIXTURE = path.join(REPO_ROOT, 'RecipeJson', 'Best_Buffalo_Chicken_Chili.json');

describe('normalizeSpoonPayload (Best_Buffalo_Chicken_Chili.json fixture)', () => {
  let payload: unknown;

  beforeAll(async () => {
    payload = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
  });

  it('maps top-level recipe fields correctly', () => {
    const { recipe } = normalizeSpoonPayload(payload);
    expect(recipe.external_id).toBe(634888);
    expect(recipe.title).toBe('Best Buffalo Chicken Chili');
    expect(recipe.image_url).toBe('https://img.spoonacular.com/recipes/634888-556x370.jpg');
    expect(recipe.source_name).toBe('Foodista');
    expect(recipe.license).toBe('CC BY 3.0');
    expect(recipe.ready_in_minutes).toBe(45);
    expect(recipe.servings).toBe(10);
    expect(recipe.health_score).toBe(39);
  });

  it('collects dietary flags from Spoonacular booleans', () => {
    const { recipe } = normalizeSpoonPayload(payload);
    expect(recipe.dietary_flags).toMatchObject({
      vegetarian: false,
      vegan: false,
      glutenFree: true,
      dairyFree: true,
    });
  });

  it('marks the recipe as is_complete when image + instructions + ingredients are present', () => {
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
      instructions: 'step 1',
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

describe('normalizeSpoonRecipe (missing fields)', () => {
  it('marks is_complete=false when instructions are missing', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'No Instructions',
      image: 'https://x',
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('marks is_complete=false when image is missing', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'No Image',
      instructions: 'step 1',
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('marks is_complete=false when ingredients are missing', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'No Ingredients',
      image: 'https://x',
      instructions: 'step 1',
    });
    expect(recipe.is_complete).toBe(false);
  });

  it('accepts analyzedInstructions in place of plain instructions', () => {
    const { recipe } = normalizeSpoonRecipe({
      id: 1,
      title: 'Analyzed Only',
      image: 'https://x',
      analyzedInstructions: [{ steps: [{ step: 'do it' }] }],
      extendedIngredients: [{ id: 1, name: 'salt' }],
    });
    expect(recipe.is_complete).toBe(true);
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
