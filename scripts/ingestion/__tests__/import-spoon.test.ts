// Unit tests for the ingestion runner with a mocked Supabase client.
//
// We don't spin Supabase up in the standard Jest run — that's covered by the
// `pgtap` CI job which already exercises the migrations + RLS. Here we verify the
// importer's contract: idempotent upserts, ingredient delete-and-replace in
// position order, ledger update, summary counters, and the PostHog duplicate signal.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createPostHog, findApparentDuplicate, readEnv, runImport } from '../import-spoon';

type RecipeRow = {
  id: string;
  external_id: number;
  title: string;
  created_at: string;
  [key: string]: unknown;
};

type IngredientRow = {
  recipe_id: string;
  name: string;
  position: number;
  [key: string]: unknown;
};

class FakeSupabase {
  recipes: RecipeRow[] = [];
  ingredients: IngredientRow[] = [];
  upsertCount = 0;

  from(table: string) {
    if (table === 'recipes') return this.recipesTable();
    if (table === 'recipe_ingredients') return this.ingredientsTable();
    throw new Error(`unexpected table ${table}`);
  }

  private recipesTable() {
    const self = this;
    return {
      // SELECT title FROM recipes
      select(_cols: string) {
        return Promise.resolve({
          data: self.recipes.map((r) => ({ title: r.title })),
          error: null,
        });
      },
      // UPSERT … RETURNING id, created_at
      upsert(row: Omit<RecipeRow, 'id' | 'created_at'>, _opts: unknown) {
        self.upsertCount += 1;
        const existing = self.recipes.find((r) => r.external_id === row.external_id);
        if (existing) {
          Object.assign(existing, row);
          return self.singleReturn(existing);
        }
        const inserted = {
          ...row,
          id: `r_${self.recipes.length + 1}`,
          created_at: new Date().toISOString(),
        } as RecipeRow;
        self.recipes.push(inserted);
        return self.singleReturn(inserted);
      },
    };
  }

  private ingredientsTable() {
    const self = this;
    return {
      delete() {
        return {
          eq(_col: string, recipeId: string) {
            self.ingredients = self.ingredients.filter((r) => r.recipe_id !== recipeId);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      insert(rows: IngredientRow[]) {
        self.ingredients.push(...rows);
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  private singleReturn(row: RecipeRow) {
    return {
      select(_cols: string) {
        return {
          single() {
            return Promise.resolve({ data: row, error: null });
          },
        };
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
    expect(supabase.recipes).toHaveLength(1);
    expect(supabase.recipes[0]!.title).toBe('Pad Thai');
    expect(supabase.ingredients.map((i) => [i.position, i.name])).toEqual([
      [0, 'rice noodles'],
      [1, 'peanuts'],
    ]);
  });

  it('is idempotent — re-running produces the same row counts', async () => {
    const supabase = new FakeSupabase();
    const targetFile = await writeFixture('PadThai.json', fixture());

    await runImport(supabase as unknown as SupabaseClient, null, {
      targetFile,
      recipeDir,
      ledgerPath,
    });
    await runImport(supabase as unknown as SupabaseClient, null, {
      targetFile,
      recipeDir,
      ledgerPath,
    });

    expect(supabase.recipes).toHaveLength(1);
    expect(supabase.ingredients).toHaveLength(2);
    expect(supabase.upsertCount).toBe(2); // upserted twice, but the table has one row
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
  });

  it('emits a PostHog duplicate signal when title similarity ≥ 0.85', async () => {
    const supabase = new FakeSupabase();
    supabase.recipes.push({
      id: 'r_seed',
      external_id: 99,
      title: 'Pad Thai',
      created_at: new Date(Date.now() - 86400_000).toISOString(),
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
  it('records a failed file when the recipes upsert errors', async () => {
    const supabase = new FakeSupabase();
    // Force the upsert to return an error.
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = ((table: string) => {
      if (table === 'recipes') {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          upsert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'bang' } }),
            }),
          }),
        };
      }
      return originalFrom(table);
    }) as typeof supabase.from;

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
