// Unit tests for the ingestion runner with a mocked Supabase client.
//
// We don't spin Supabase up in the standard Jest run — that's covered by the
// `pgtap` CI job which already exercises the migrations + RLS. Here we verify the
// importer's contract: atomic RPC writes, idempotent insert/update reporting,
// ledger update, summary counters, and the PostHog duplicate signal.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createPostHog, findApparentDuplicate, readEnv, runImport } from '../import-spoon';

type RecipeRow = {
  id: string;
  external_id: number;
  title: string;
  [key: string]: unknown;
};

type GraphRecipePayload = {
  external_id: number;
  title: string;
  [key: string]: unknown;
};

type GraphIngredientPayload = {
  name: string;
  sort_order: number;
  spoonacular_ingredient_id: number | null;
  [key: string]: unknown;
};

type GraphPayload = {
  recipe: GraphRecipePayload;
  ingredients: GraphIngredientPayload[];
  [key: string]: unknown;
};

type RpcArgs = { payload: GraphPayload };
type RpcResponse = Promise<{
  data: { recipe_id: string; inserted: boolean } | null;
  error: null | { message: string };
}>;

class FakeSupabase {
  recipes: RecipeRow[] = [];
  payloads: GraphPayload[] = [];
  rpcCount = 0;
  lastPayload: GraphPayload | null = null;

  from(table: string) {
    if (table === 'recipes') return this.recipesTable();
    throw new Error(`unexpected table ${table}`);
  }

  rpc(fn: string, args: RpcArgs): RpcResponse {
    expect(fn).toBe('import_recipe_graph');
    this.rpcCount += 1;
    this.lastPayload = args.payload;
    this.payloads.push(args.payload);

    const { external_id, title } = args.payload.recipe;
    const existing = this.recipes.find((r) => r.external_id === external_id);
    if (existing) {
      existing.title = title;
      return Promise.resolve({ data: { recipe_id: existing.id, inserted: false }, error: null });
    }

    const inserted = { id: `r_${this.recipes.length + 1}`, external_id, title };
    this.recipes.push(inserted);
    return Promise.resolve({ data: { recipe_id: inserted.id, inserted: true }, error: null });
  }

  private recipesTable() {
    const self = this;
    return {
      select(_cols: string) {
        return Promise.resolve({
          data: self.recipes.map((r) => ({ title: r.title })),
          error: null,
        });
      },
    };
  }
}

let recipeDir: string;
let ledgerPath: string;

beforeEach(async () => {
  recipeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cd-ingest-'));
  ledgerPath = path.join(recipeDir, '.imported.json');
});

afterEach(async () => {
  await fs.rm(recipeDir, { recursive: true, force: true });
});

async function writeFixture(filename: string, payload: object) {
  const target = path.join(recipeDir, filename);
  await fs.writeFile(target, JSON.stringify(payload), 'utf8');
  return target;
}

const fixture = (overrides: Partial<{ id: number; title: string }> = {}) => ({
  recipes: [
    {
      id: overrides.id ?? 1001,
      title: overrides.title ?? 'Pad Thai',
      image: 'https://img/x.png',
      instructions: 'cook it',
      vegan: false,
      glutenFree: true,
      extendedIngredients: [
        { id: 100, name: 'rice noodles', amount: 200, unit: 'g', aisle: 'Pasta' },
        { id: 200, name: 'peanuts', amount: 30, unit: 'g', aisle: 'Nuts' },
      ],
    },
  ],
});

describe('runImport (mocked Supabase)', () => {
  it('inserts a recipe + its ingredients in position order', async () => {
    const supabase = new FakeSupabase();
    const targetFile = await writeFixture('PadThai.json', fixture());
    const summary = await runImport(supabase as unknown as SupabaseClient, null, {
      targetFile,
      recipeDir,
      ledgerPath,
    });

    expect(summary).toMatchObject({ attempted: 1, inserted: 1, upserted: 0, failed: 0 });
    expect(supabase.rpcCount).toBe(1);
    expect(supabase.recipes).toHaveLength(1);
    expect(supabase.recipes[0]!.title).toBe('Pad Thai');
    expect(supabase.lastPayload?.recipe.external_id).toBe(1001);
    expect(supabase.lastPayload?.ingredients.map((i) => [i.sort_order, i.name])).toEqual([
      [0, 'rice noodles'],
      [1, 'peanuts'],
    ]);
    expect(supabase.lastPayload?.ingredients[0]).toEqual(
      expect.objectContaining({
        spoonacular_ingredient_id: 100,
        original: null,
        image: null,
      }),
    );
    expect(supabase.lastPayload?.ingredients[0]).not.toHaveProperty('ext_ingredient_id');
  });

  it('is idempotent — re-running produces the same row counts', async () => {
    const supabase = new FakeSupabase();
    const targetFile = await writeFixture('PadThai.json', fixture());

    const first = await runImport(supabase as unknown as SupabaseClient, null, {
      targetFile,
      recipeDir,
      ledgerPath,
    });
    const second = await runImport(supabase as unknown as SupabaseClient, null, {
      targetFile,
      recipeDir,
      ledgerPath,
    });

    expect(first).toMatchObject({ inserted: 1, upserted: 0 });
    expect(second).toMatchObject({ inserted: 0, upserted: 1 });
    expect(supabase.recipes).toHaveLength(1);
    expect(supabase.rpcCount).toBe(2);
  });

  it('skips already-imported files on backfill runs (no targetFile)', async () => {
    const supabase = new FakeSupabase();
    await writeFixture('PadThai.json', fixture());

    const first = await runImport(supabase as unknown as SupabaseClient, null, {
      recipeDir,
      ledgerPath,
    });
    const second = await runImport(supabase as unknown as SupabaseClient, null, {
      recipeDir,
      ledgerPath,
    });

    expect(first.inserted).toBe(1);
    expect(second.skipped).toBe(1);
    expect(second.upserted).toBe(0);
  });

  it('per-file errors do not abort the run', async () => {
    const supabase = new FakeSupabase();
    await writeFixture('Good.json', fixture({ id: 1001, title: 'Pad Thai' }));
    await writeFixture('Bad.json', { not: 'a spoonacular payload' });

    const summary = await runImport(supabase as unknown as SupabaseClient, null, {
      recipeDir,
      ledgerPath,
    });

    expect(summary.attempted).toBe(2);
    expect(summary.inserted).toBe(1);
    expect(summary.failed).toBe(1);
    expect(supabase.recipes).toHaveLength(1);
    expect(supabase.rpcCount).toBe(1);
  });

  it('emits a PostHog duplicate signal when title similarity ≥ 0.85', async () => {
    const supabase = new FakeSupabase();
    supabase.recipes.push({
      id: 'r_seed',
      external_id: 99,
      title: 'Pad Thai',
    });
    const capture = jest.fn();
    const posthog = { capture, shutdown: jest.fn() } as unknown as Parameters<typeof runImport>[1];

    const targetFile = await writeFixture(
      'PadThai2.json',
      fixture({ id: 1002, title: 'pad thai!' }),
    );
    await runImport(supabase as unknown as SupabaseClient, posthog, {
      targetFile,
      recipeDir,
      ledgerPath,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'recipe_apparent_duplicate',
        properties: expect.objectContaining({
          external_id: 1002,
          apparent_match: 'Pad Thai',
        }),
      }),
    );
  });
});

describe('runImport — error handling', () => {
  it('records a failed file when the import_recipe_graph RPC errors', async () => {
    const supabase = new FakeSupabase();
    supabase.rpc = ((_fn: string, _args: RpcArgs) =>
      Promise.resolve({ data: null, error: { message: 'bang' } })) as typeof supabase.rpc;

    const targetFile = await writeFixture('PadThai.json', fixture());
    const summary = await runImport(supabase as unknown as SupabaseClient, null, {
      targetFile,
      recipeDir,
      ledgerPath,
    });
    expect(summary.failed).toBe(1);
    expect(summary.inserted).toBe(0);
  });

  it('logs a warning but continues when fetchExistingTitles errors', async () => {
    const supabase = new FakeSupabase();
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = ((table: string) => {
      if (table === 'recipes') {
        return {
          ...originalFrom(table),
          select: () => Promise.resolve({ data: null, error: { message: 'lookup failed' } }),
        };
      }
      return originalFrom(table);
    }) as typeof supabase.from;

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const targetFile = await writeFixture('PadThai.json', fixture());
    const summary = await runImport(supabase as unknown as SupabaseClient, null, {
      targetFile,
      recipeDir,
      ledgerPath,
    });
    warn.mockRestore();

    // Title-lookup failure should NOT abort — the file still imports successfully.
    expect(summary.inserted).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.attempted).toBe(1);
  });
});

describe('readEnv + createPostHog', () => {
  const SCOPED_KEYS = [
    'SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'POSTHOG_KEY',
    'EXPO_PUBLIC_POSTHOG_KEY',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of SCOPED_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of SCOPED_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('readEnv prefers SUPABASE_URL over EXPO_PUBLIC_SUPABASE_URL', () => {
    process.env.SUPABASE_URL = 'http://server';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://public';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sr';
    expect(readEnv()).toEqual({ url: 'http://server', serviceRoleKey: 'sr' });
  });

  it('readEnv falls back to EXPO_PUBLIC_SUPABASE_URL when SUPABASE_URL is unset', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://public';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sr';
    expect(readEnv()).toEqual({ url: 'http://public', serviceRoleKey: 'sr' });
  });

  it('readEnv throws when URL is missing', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sr';
    expect(() => readEnv()).toThrow(/SUPABASE_URL/);
  });

  it('readEnv throws when SERVICE_ROLE_KEY is missing', () => {
    process.env.SUPABASE_URL = 'http://x';
    expect(() => readEnv()).toThrow(/SERVICE_ROLE_KEY/);
  });

  it('createPostHog returns null when no key is configured', () => {
    expect(createPostHog()).toBeNull();
  });
});

describe('findApparentDuplicate', () => {
  it('returns the highest-scoring title above the threshold', () => {
    const match = findApparentDuplicate('Pad Thai!', ['Pad Thai', 'Pulled Pork Nachos']);
    expect(match?.title).toBe('Pad Thai');
    expect(match?.score).toBeGreaterThanOrEqual(0.85);
  });

  it('returns null when nothing is similar enough', () => {
    expect(findApparentDuplicate('Pad Thai', ['Pulled Pork Nachos', 'Baked Rigatoni'])).toBeNull();
  });

  it('ignores exact self-match (handles re-fetch of the same title)', () => {
    expect(findApparentDuplicate('Pad Thai', ['Pad Thai'])).toBeNull();
  });
});
