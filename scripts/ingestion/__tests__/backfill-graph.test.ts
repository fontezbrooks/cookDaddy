import type { SupabaseClient } from '@supabase/supabase-js';

import { runBackfill } from '../backfill-graph';
import type { SpoonRecipe } from '../normalize';

type RecipeRow = {
  id: string;
  external_id: number | null;
  raw_payload: SpoonRecipe;
};

type GraphRecipePayload = {
  external_id: number;
  is_complete: boolean;
  [key: string]: unknown;
};

type GraphIngredientPayload = {
  name: string;
  sort_order: number;
  spoonacular_ingredient_id: number | null;
  [key: string]: unknown;
};

type GraphInstructionGroupPayload = {
  name: string | null;
  steps: { step_text: string; sort_order: number; [key: string]: unknown }[];
  [key: string]: unknown;
};

type GraphPayload = {
  recipe: GraphRecipePayload;
  ingredients: GraphIngredientPayload[];
  instruction_groups: GraphInstructionGroupPayload[];
  [key: string]: unknown;
};

type RpcArgs = { payload: GraphPayload };
type QueryResult = Promise<{ data: RecipeRow[] | null; error: null | { message: string } }>;
type RpcResponse = Promise<{
  data: { recipe_id: string; inserted: boolean } | null;
  error: null | { message: string };
}>;

class FakeSupabase {
  readonly payloads: GraphPayload[] = [];
  readonly rows: RecipeRow[];
  failSelect = false;
  failExternalId: number | null = null;

  constructor(rows: RecipeRow[]) {
    this.rows = rows;
  }

  from(table: string) {
    if (table === 'recipes') return this.recipesTable();
    throw new Error(`unexpected table ${table}`);
  }

  rpc(fn: string, args: RpcArgs): RpcResponse {
    expect(fn).toBe('import_recipe_graph');
    this.payloads.push(args.payload);

    if (args.payload.recipe.external_id === this.failExternalId) {
      return Promise.resolve({ data: null, error: { message: 'rpc failed' } });
    }

    return Promise.resolve({
      data: { recipe_id: `r_${this.payloads.length}`, inserted: true },
      error: null,
    });
  }

  private recipesTable() {
    const self = this;
    return {
      select(cols: string) {
        expect(cols).toBe('id, external_id, raw_payload');
        return {
          order(column: string, opts: { ascending: boolean }) {
            expect(column).toBe('external_id');
            expect(opts).toEqual({ ascending: true });
            return {
              range(from: number, to: number): QueryResult {
                if (self.failSelect) {
                  return Promise.resolve({ data: null, error: { message: 'select failed' } });
                }
                const sorted = [...self.rows].sort(
                  (a, b) => (a.external_id ?? 0) - (b.external_id ?? 0),
                );
                return Promise.resolve({ data: sorted.slice(from, to + 1), error: null });
              },
            };
          },
        };
      },
    };
  }
}

const completeRecipe = (id: number, title = `Recipe ${id}`): SpoonRecipe => ({
  id,
  title,
  image: `https://img/${id}.jpg`,
  imageType: 'jpg',
  sourceUrl: `https://source/${id}`,
  readyInMinutes: 25,
  servings: 4,
  vegetarian: true,
  extendedIngredients: [
    {
      id: 100 + id,
      name: 'rice noodles',
      nameClean: 'rice noodles',
      original: '1 cup rice noodles',
      amount: 1,
      unit: 'cup',
      aisle: 'Pasta',
      image: 'noodles.jpg',
      measures: {
        us: { amount: 1, unitShort: 'cup', unitLong: 'cup' },
        metric: { amount: 240, unitShort: 'g', unitLong: 'grams' },
      },
    },
  ],
  analyzedInstructions: [
    {
      name: '',
      steps: [
        {
          number: 1,
          step: 'Boil the noodles.',
          ingredients: [{ id: 100 + id, name: 'rice noodles' }],
          equipment: [{ id: 404, name: 'pot' }],
        },
      ],
    },
  ],
  nutrition: {
    nutrients: [{ name: 'Calories', amount: 420, unit: 'kcal', percentOfDailyNeeds: 21 }],
  },
});

const incompleteRecipe = (id: number): SpoonRecipe => ({
  ...completeRecipe(id, `Incomplete ${id}`),
  analyzedInstructions: [],
});

const row = (raw_payload: SpoonRecipe): RecipeRow => ({
  id: `db_${raw_payload.id ?? 'bad'}`,
  external_id: raw_payload.id ?? null,
  raw_payload,
});

describe('runBackfill', () => {
  it('processes all seeded rows', async () => {
    const supabase = new FakeSupabase([
      row(completeRecipe(3002)),
      row(incompleteRecipe(3001)),
      row(completeRecipe(3003)),
    ]);

    const summary = await runBackfill(supabase as unknown as SupabaseClient, { pageSize: 2 });

    expect(summary).toMatchObject({ processed: 3, succeeded: 3, failed: 0 });
    expect(supabase.payloads.map((payload) => payload.recipe.external_id)).toEqual([
      3001, 3002, 3003,
    ]);
  });

  it('classifies complete vs incomplete recipes correctly', async () => {
    const supabase = new FakeSupabase([row(completeRecipe(3101)), row(incompleteRecipe(3102))]);

    const summary = await runBackfill(supabase as unknown as SupabaseClient, { pageSize: 1 });

    expect(summary.complete).toBe(1);
    expect(summary.incomplete).toBe(1);
  });

  it('sends normalized graph payloads to import_recipe_graph', async () => {
    const supabase = new FakeSupabase([row(completeRecipe(3201))]);

    await runBackfill(supabase as unknown as SupabaseClient);

    expect(supabase.payloads).toHaveLength(1);
    expect(supabase.payloads[0]?.recipe.external_id).toBe(3201);
    expect(supabase.payloads[0]?.ingredients).toEqual([
      expect.objectContaining({
        spoonacular_ingredient_id: 3301,
        name: 'rice noodles',
        sort_order: 0,
      }),
    ]);
    expect(supabase.payloads[0]?.instruction_groups).toEqual([
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            step_text: 'Boil the noodles.',
            sort_order: 0,
          }),
        ],
      }),
    ]);
  });

  it('records per-row RPC failures and continues', async () => {
    const supabase = new FakeSupabase([
      row(completeRecipe(3301)),
      row(completeRecipe(3302)),
      row(completeRecipe(3303)),
    ]);
    supabase.failExternalId = 3302;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await runBackfill(supabase as unknown as SupabaseClient);
    warn.mockRestore();

    expect(summary).toMatchObject({ processed: 3, succeeded: 2, failed: 1 });
    expect(summary.failures).toEqual([{ external_id: 3302, error: 'rpc failed' }]);
    expect(supabase.payloads.map((payload) => payload.recipe.external_id)).toEqual([
      3301, 3302, 3303,
    ]);
  });

  it('records normalization failures and continues', async () => {
    const invalid = { image: 'https://img/bad.jpg' } as SpoonRecipe;
    const supabase = new FakeSupabase([row(completeRecipe(3401)), row(invalid)]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await runBackfill(supabase as unknown as SupabaseClient);
    warn.mockRestore();

    expect(summary).toMatchObject({ processed: 2, succeeded: 1, failed: 1 });
    expect(summary.failures[0]).toEqual({
      external_id: null,
      error: 'recipe.id is missing or invalid',
    });
    expect(supabase.payloads).toHaveLength(1);
  });

  it('throws when selecting recipes fails', async () => {
    const supabase = new FakeSupabase([row(completeRecipe(3501))]);
    supabase.failSelect = true;

    await expect(runBackfill(supabase as unknown as SupabaseClient)).rejects.toThrow(
      'select failed',
    );
  });
});
