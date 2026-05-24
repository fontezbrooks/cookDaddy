// Pure normalizer: Spoonacular API payload → DB-ready (recipes row + recipe_ingredients rows).
//
// Tested in scripts/ingestion/__tests__/normalize.test.ts against the JSON fixtures in
// RecipeJson/. Keep this file dependency-free (no Supabase imports) so the same logic
// can run under Jest, in CI, and in the cron-driven node CLI without environment knowledge.
//
// Spec: docs/DESIGN/README.md §3.2.5–§3.2.6 + docs/WORKFLOW/README.md §6.

export type SpoonRoot = {
  recipes?: SpoonRecipe[];
};

export type SpoonRecipe = {
  id?: number;
  title?: string;
  image?: string;
  imageType?: string;
  sourceUrl?: string;
  spoonacularSourceUrl?: string;
  sourceName?: string;
  creditsText?: string;
  license?: string;
  readyInMinutes?: number;
  preparationMinutes?: number | null;
  cookingMinutes?: number | null;
  servings?: number;
  healthScore?: number;
  veryPopular?: boolean;
  gaps?: string;
  weightWatcherSmartPoints?: number;
  aggregateLikes?: number;
  spoonacularScore?: number;
  pricePerServing?: number;
  summary?: string;
  language?: string;
  originalId?: number | string | null;
  cuisines?: string[];
  dishTypes?: string[];
  diets?: string[];
  occasions?: string[];
  nutrition?: SpoonNutrition;
  // dietary flags Spoonacular surfaces as booleans
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  lowFodmap?: boolean;
  veryHealthy?: boolean;
  cheap?: boolean;
  sustainable?: boolean;
  ketogenic?: boolean;
  whole30?: boolean;
  instructions?: string | null;
  analyzedInstructions?: SpoonInstructionGroup[];
  extendedIngredients?: SpoonIngredient[];
};

export type SpoonNutrient = {
  name?: string;
  amount?: number;
  unit?: string;
  percentOfDailyNeeds?: number;
};

export type SpoonNutritionProperty = { name?: string; amount?: number; unit?: string };

export type SpoonNutritionIngredient = {
  id?: number;
  name?: string;
  amount?: number;
  unit?: string;
  nutrients?: SpoonNutrient[];
};

export type SpoonNutrition = {
  nutrients?: SpoonNutrient[];
  properties?: SpoonNutritionProperty[];
  flavonoids?: SpoonNutritionProperty[];
  ingredients?: SpoonNutritionIngredient[];
  caloricBreakdown?: {
    percentProtein?: number;
    percentFat?: number;
    percentCarbs?: number;
  };
  weightPerServing?: { amount?: number; unit?: string };
};

export type SpoonStepRef = {
  id?: number;
  name?: string;
  localizedName?: string;
  image?: string;
};

export type SpoonStep = {
  number?: number;
  step?: string;
  length?: { number?: number; unit?: string };
  ingredients?: SpoonStepRef[];
  equipment?: SpoonStepRef[];
};

export type SpoonInstructionGroup = { name?: string; steps?: SpoonStep[] };

export type SpoonMeasure = { amount?: number; unitShort?: string; unitLong?: string };

export type SpoonIngredient = {
  id?: number;
  name?: string;
  nameClean?: string | null;
  original?: string;
  consistency?: string;
  originalName?: string;
  meta?: string[];
  measures?: { us?: SpoonMeasure; metric?: SpoonMeasure };
  amount?: number;
  unit?: string;
  aisle?: string;
  image?: string;
};

export type NormalizedRecipe = {
  external_id: number;
  title: string;
  image_url: string | null;
  source_url: string | null;
  source_name: string | null;
  credits_text: string | null;
  license: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
  health_score: number | null;
  image_type: string | null;
  spoonacular_source_url: string | null;
  preparation_minutes: number | null;
  cooking_minutes: number | null;
  summary: string | null;
  instructions: string | null;
  language: string | null;
  original_id: string | null;
  gaps: string | null;
  aggregate_likes: number | null;
  spoonacular_score: number | null;
  price_per_serving_cents: number | null;
  weight_watcher_smart_points: number | null;
  caloric_percent_protein: number | null;
  caloric_percent_fat: number | null;
  caloric_percent_carbs: number | null;
  weight_per_serving_amount: number | null;
  weight_per_serving_unit: string | null;
  vegetarian: boolean;
  vegan: boolean;
  gluten_free: boolean;
  dairy_free: boolean;
  very_healthy: boolean;
  cheap: boolean;
  very_popular: boolean;
  sustainable: boolean;
  low_fodmap: boolean;
  ketogenic: boolean;
  whole30: boolean;
  dietary_flags: Record<string, boolean>;
  raw_payload: SpoonRecipe;
  is_complete: boolean;
};

export type NormalizedMeasure = {
  system: 'us' | 'metric';
  amount: number | null;
  unit_short: string | null;
  unit_long: string | null;
};

export type NormalizedIngredient = {
  ext_ingredient_id: number | null;
  name: string;
  name_clean: string | null;
  original_text: string | null;
  amount: number | null;
  unit: string | null;
  aisle: string | null;
  image_url: string | null;
  position: number;
  consistency: string | null;
  original_name: string | null;
  meta: string[];
  measures: NormalizedMeasure[];
};

export type NormalizedNutrient = {
  name: string;
  amount: number | null;
  unit: string | null;
  percent_of_daily_needs: number | null;
};

export type NormalizedNutritionProperty = {
  name: string;
  amount: number | null;
  unit: string | null;
};

export type NormalizedNutritionIngredient = {
  spoonacular_ingredient_id: number | null;
  name: string;
  amount: number | null;
  unit: string | null;
  sort_order: number;
  nutrients: NormalizedNutrient[];
};

export type NormalizedStepRef = {
  spoonacular_ingredient_id: number | null;
  name: string | null;
  localized_name: string | null;
  image: string | null;
};

export type NormalizedStepEquipment = {
  spoonacular_equipment_id: number | null;
  name: string | null;
  localized_name: string | null;
  image: string | null;
};

export type NormalizedInstructionStep = {
  step_number: number;
  step_text: string;
  length_number: number | null;
  length_unit: string | null;
  sort_order: number;
  step_ingredients: NormalizedStepRef[];
  step_equipment: NormalizedStepEquipment[];
};

export type NormalizedInstructionGroup = {
  name: string | null;
  sort_order: number;
  steps: NormalizedInstructionStep[];
};

export type NormalizedTag = {
  tag_type: 'cuisine' | 'dish_type' | 'diet' | 'occasion';
  value: string;
};

export type NormalizationResult = {
  recipe: NormalizedRecipe;
  ingredients: NormalizedIngredient[];
  nutrients: NormalizedNutrient[];
  nutritionProperties: NormalizedNutritionProperty[];
  flavonoids: NormalizedNutritionProperty[];
  nutritionIngredients: NormalizedNutritionIngredient[];
  instructionGroups: NormalizedInstructionGroup[];
  tags: NormalizedTag[];
};

export class NormalizationError extends Error {
  override readonly name = 'NormalizationError';
}

const DIETARY_FLAG_KEYS = [
  'vegetarian',
  'vegan',
  'glutenFree',
  'dairyFree',
  'lowFodmap',
  'veryHealthy',
  'cheap',
  'sustainable',
  'ketogenic',
  'whole30',
] as const;

// Take a full Spoonacular `/recipes/random` payload (i.e. { recipes: [...] }) and emit
// the first recipe normalized. The cron's PowerShell wrapper always writes a single-recipe
// envelope, so we read [0].
export function normalizeSpoonPayload(payload: unknown): NormalizationResult {
  if (!isObject(payload)) {
    throw new NormalizationError('payload is not an object');
  }
  const recipes = (payload as SpoonRoot).recipes;
  if (!Array.isArray(recipes) || recipes.length === 0) {
    throw new NormalizationError('payload.recipes is missing or empty');
  }
  return normalizeSpoonRecipe(recipes[0]!);
}

export function normalizeSpoonRecipe(raw: SpoonRecipe): NormalizationResult {
  if (typeof raw.id !== 'number' || !Number.isFinite(raw.id)) {
    throw new NormalizationError('recipe.id is missing or invalid');
  }
  if (typeof raw.title !== 'string' || raw.title.length === 0) {
    throw new NormalizationError('recipe.title is missing');
  }

  const dietary_flags = pickDietaryFlags(raw);
  const ingredients = normalizeIngredients(raw.extendedIngredients ?? []);
  const nutrients = normalizeNutrients(raw.nutrition?.nutrients ?? []);
  const nutritionProperties = normalizeNutritionProperties(raw.nutrition?.properties ?? []);
  const flavonoids = normalizeNutritionProperties(raw.nutrition?.flavonoids ?? []);
  const nutritionIngredients = normalizeNutritionIngredients(raw.nutrition?.ingredients ?? []);
  const instructionGroups = normalizeInstructionGroups(raw.analyzedInstructions ?? []);
  const tags = normalizeTags(raw);
  const is_complete = isComplete(raw, ingredients, nutrients, instructionGroups);

  const recipe: NormalizedRecipe = {
    external_id: raw.id,
    title: raw.title,
    image_url: stringOrNull(raw.image),
    source_url: stringOrNull(raw.sourceUrl),
    source_name: stringOrNull(raw.sourceName),
    credits_text: stringOrNull(raw.creditsText),
    license: stringOrNull(raw.license),
    ready_in_minutes: numberOrNull(raw.readyInMinutes),
    servings: numberOrNull(raw.servings),
    health_score: numberOrNull(raw.healthScore),
    image_type: stringOrNull(raw.imageType),
    spoonacular_source_url: stringOrNull(raw.spoonacularSourceUrl),
    preparation_minutes: numberOrNull(raw.preparationMinutes),
    cooking_minutes: numberOrNull(raw.cookingMinutes),
    summary: stringOrNull(raw.summary),
    instructions: stringOrNull(raw.instructions),
    language: stringOrNull(raw.language),
    original_id: originalIdOrNull(raw.originalId),
    gaps: stringOrNull(raw.gaps),
    aggregate_likes: numberOrNull(raw.aggregateLikes),
    spoonacular_score: numberOrNull(raw.spoonacularScore),
    price_per_serving_cents: numberOrNull(raw.pricePerServing),
    weight_watcher_smart_points: numberOrNull(raw.weightWatcherSmartPoints),
    caloric_percent_protein: numberOrNull(raw.nutrition?.caloricBreakdown?.percentProtein),
    caloric_percent_fat: numberOrNull(raw.nutrition?.caloricBreakdown?.percentFat),
    caloric_percent_carbs: numberOrNull(raw.nutrition?.caloricBreakdown?.percentCarbs),
    weight_per_serving_amount: numberOrNull(raw.nutrition?.weightPerServing?.amount),
    weight_per_serving_unit: stringOrNull(raw.nutrition?.weightPerServing?.unit),
    vegetarian: raw.vegetarian === true,
    vegan: raw.vegan === true,
    gluten_free: raw.glutenFree === true,
    dairy_free: raw.dairyFree === true,
    very_healthy: raw.veryHealthy === true,
    cheap: raw.cheap === true,
    very_popular: raw.veryPopular === true,
    sustainable: raw.sustainable === true,
    low_fodmap: raw.lowFodmap === true,
    ketogenic: raw.ketogenic === true,
    whole30: raw.whole30 === true,
    dietary_flags,
    raw_payload: raw,
    is_complete,
  };

  return {
    recipe,
    ingredients,
    nutrients,
    nutritionProperties,
    flavonoids,
    nutritionIngredients,
    instructionGroups,
    tags,
  };
}

function normalizeIngredients(items: SpoonIngredient[]): NormalizedIngredient[] {
  // De-duplicate by ext_ingredient_id within a single recipe so the unique index
  // on (recipe_id, position) is never the thing that catches a bad payload.
  // Position is the index from Spoonacular's order — the deck UI relies on it being stable.
  const seen = new Set<number>();
  const out: NormalizedIngredient[] = [];
  let position = 0;
  for (const ing of items) {
    const name = typeof ing.name === 'string' ? ing.name.trim() : '';
    if (name.length === 0) continue;
    const extId = numberOrNull(ing.id);
    if (extId !== null) {
      if (seen.has(extId)) continue;
      seen.add(extId);
    }
    out.push({
      ext_ingredient_id: extId,
      name,
      name_clean: stringOrNull(ing.nameClean) ?? name.toLowerCase(),
      original_text: stringOrNull(ing.original),
      amount: numberOrNull(ing.amount),
      unit: stringOrNull(ing.unit),
      aisle: stringOrNull(ing.aisle),
      image_url: stringOrNull(ing.image),
      position,
      consistency: stringOrNull(ing.consistency),
      original_name: stringOrNull(ing.originalName),
      meta: Array.isArray(ing.meta) ? ing.meta : [],
      measures: normalizeMeasures(ing.measures),
    });
    position += 1;
  }
  return out;
}

function normalizeMeasures(measures: SpoonIngredient['measures']): NormalizedMeasure[] {
  if (!measures) return [];
  return (['us', 'metric'] as const).flatMap((system) => {
    const measure = measures[system];
    if (!measure) return [];
    return [
      {
        system,
        amount: numberOrNull(measure.amount),
        unit_short: stringOrNull(measure.unitShort),
        unit_long: stringOrNull(measure.unitLong),
      },
    ];
  });
}

function normalizeNutrients(items: SpoonNutrient[]): NormalizedNutrient[] {
  return items.flatMap((item) => {
    const name = trimOrNull(item.name);
    if (name === null) return [];
    return [
      {
        name,
        amount: numberOrNull(item.amount),
        unit: stringOrNull(item.unit),
        percent_of_daily_needs: numberOrNull(item.percentOfDailyNeeds),
      },
    ];
  });
}

function normalizeNutritionProperties(
  items: SpoonNutritionProperty[],
): NormalizedNutritionProperty[] {
  return items.flatMap((item) => {
    const name = trimOrNull(item.name);
    if (name === null) return [];
    return [{ name, amount: numberOrNull(item.amount), unit: stringOrNull(item.unit) }];
  });
}

function normalizeNutritionIngredients(
  items: SpoonNutritionIngredient[],
): NormalizedNutritionIngredient[] {
  return denseMap(items, (item, sortOrder) => {
    const name = trimOrNull(item.name);
    if (name === null) return null;
    return {
      spoonacular_ingredient_id: numberOrNull(item.id),
      name,
      amount: numberOrNull(item.amount),
      unit: stringOrNull(item.unit),
      sort_order: sortOrder,
      nutrients: normalizeNutrients(item.nutrients ?? []),
    };
  });
}

function normalizeInstructionGroups(items: SpoonInstructionGroup[]): NormalizedInstructionGroup[] {
  return items.map((group, sortOrder) => ({
    name: stringOrNull(group.name),
    sort_order: sortOrder,
    steps: normalizeInstructionSteps(group.steps ?? []),
  }));
}

function normalizeInstructionSteps(items: SpoonStep[]): NormalizedInstructionStep[] {
  return denseMap(items, (item, sortOrder) => {
    const stepText = trimOrNull(item.step);
    if (stepText === null) return null;
    return {
      step_number: numberOrNull(item.number) ?? sortOrder + 1,
      step_text: stepText,
      length_number: numberOrNull(item.length?.number),
      length_unit: stringOrNull(item.length?.unit),
      sort_order: sortOrder,
      step_ingredients: normalizeStepRefs(item.ingredients ?? []),
      step_equipment: normalizeStepEquipment(item.equipment ?? []),
    };
  });
}

function normalizeStepRefs(items: SpoonStepRef[]): NormalizedStepRef[] {
  return items.map((item) => ({
    spoonacular_ingredient_id: numberOrNull(item.id),
    name: stringOrNull(item.name),
    localized_name: stringOrNull(item.localizedName),
    image: stringOrNull(item.image),
  }));
}

function normalizeStepEquipment(items: SpoonStepRef[]): NormalizedStepEquipment[] {
  return items.map((item) => ({
    spoonacular_equipment_id: numberOrNull(item.id),
    name: stringOrNull(item.name),
    localized_name: stringOrNull(item.localizedName),
    image: stringOrNull(item.image),
  }));
}

function normalizeTags(raw: SpoonRecipe): NormalizedTag[] {
  return [
    ...tagRows('cuisine', raw.cuisines ?? []),
    ...tagRows('dish_type', raw.dishTypes ?? []),
    ...tagRows('diet', raw.diets ?? []),
    ...tagRows('occasion', raw.occasions ?? []),
  ];
}

function tagRows(tagType: NormalizedTag['tag_type'], values: string[]): NormalizedTag[] {
  return values.flatMap((value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return [];
    return [{ tag_type: tagType, value: trimmed }];
  });
}

function isComplete(
  raw: SpoonRecipe,
  ingredients: NormalizedIngredient[],
  nutrients: NormalizedNutrient[],
  instructionGroups: NormalizedInstructionGroup[],
): boolean {
  const stepCount = instructionGroups.reduce((sum, group) => sum + group.steps.length, 0);
  return (
    raw.title !== undefined &&
    stringOrNull(raw.image) !== null &&
    ingredients.length >= 1 &&
    stepCount >= 1 &&
    nutrients.some((nutrient) => nutrient.name === 'Calories')
  );
}

function denseMap<T, U>(items: T[], mapItem: (item: T, denseIndex: number) => U | null): U[] {
  const out: U[] = [];
  for (const item of items) {
    const mapped = mapItem(item, out.length);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

function pickDietaryFlags(raw: SpoonRecipe): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of DIETARY_FLAG_KEYS) {
    const v = raw[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function originalIdOrNull(v: SpoonRecipe['originalId']): string | null {
  if (typeof v === 'number') return String(v);
  return stringOrNull(v);
}

// Sørensen-Dice bigram similarity for the post-MVP fuzzy-dedup signal. We don't dedup
// in v1 — we just emit a PostHog event when a new title is ≥0.85 similar to an existing
// one, to size the problem before building the de-dup pipeline.
export function titleSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const x = norm(a);
  const y = norm(b);
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(x);
  const mb = bigrams(y);
  let intersect = 0;
  for (const [k, av] of ma) {
    const bv = mb.get(k);
    if (bv) intersect += Math.min(av, bv);
  }
  const totalA = x.length - 1;
  const totalB = y.length - 1;
  return (2 * intersect) / (totalA + totalB);
}
