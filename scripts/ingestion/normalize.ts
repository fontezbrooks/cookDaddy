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
  sourceUrl?: string;
  sourceName?: string;
  creditsText?: string;
  license?: string;
  readyInMinutes?: number;
  servings?: number;
  healthScore?: number;
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
  analyzedInstructions?: { steps?: { step?: string }[] }[];
  extendedIngredients?: SpoonIngredient[];
};

export type SpoonIngredient = {
  id?: number;
  name?: string;
  nameClean?: string | null;
  original?: string;
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
  dietary_flags: Record<string, boolean>;
  raw_payload: SpoonRecipe;
  is_complete: boolean;
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
};

export type NormalizationResult = {
  recipe: NormalizedRecipe;
  ingredients: NormalizedIngredient[];
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

  const hasInstructions =
    (typeof raw.instructions === 'string' && raw.instructions.trim().length > 0) ||
    (Array.isArray(raw.analyzedInstructions) &&
      raw.analyzedInstructions.some((g) => Array.isArray(g.steps) && g.steps.length > 0));
  const hasImage = typeof raw.image === 'string' && raw.image.length > 0;
  const hasIngredients = ingredients.length > 0;
  const is_complete = hasInstructions && hasImage && hasIngredients;

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
    dietary_flags,
    raw_payload: raw,
    is_complete,
  };

  return { recipe, ingredients };
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
    });
    position += 1;
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
