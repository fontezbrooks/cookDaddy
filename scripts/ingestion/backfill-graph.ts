#!/usr/bin/env node
// One-time graph backfill: reads recipes.raw_payload, re-normalizes each stored
// Spoonacular recipe object, and idempotently writes the full graph through the RPC.

import 'dotenv/config';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildGraphPayload, readEnv } from './import-spoon';
import { normalizeSpoonRecipe, type SpoonRecipe } from './normalize';

export type BackfillSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  complete: number;
  incomplete: number;
  failures: { external_id: number | null; error: string }[];
};

type RecipeBackfillRow = {
  id: string;
  external_id: number | null;
  raw_payload: unknown;
};

type SelectRecipesResult = {
  data: RecipeBackfillRow[] | null;
  error: { message: string } | null;
};

type ImportRecipeGraphResult = {
  recipe_id?: string;
  inserted?: boolean;
};

type RpcResult = {
  data: ImportRecipeGraphResult | null;
  error: { message: string } | null;
};

export async function runBackfill(
  supabase: SupabaseClient,
  opts: { pageSize?: number } = {},
): Promise<BackfillSummary> {
  const pageSize = opts.pageSize ?? 1000;
  const summary = emptySummary();

  for (let from = 0; ; from += pageSize) {
    const rows = await fetchRecipePage(supabase, from, from + pageSize - 1);
    if (rows.length === 0) return summary;

    for (const row of rows) {
      summary.processed += 1;
      await backfillRow(supabase, row, summary);
    }
  }
}

function emptySummary(): BackfillSummary {
  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    complete: 0,
    incomplete: 0,
    failures: [],
  };
}

async function fetchRecipePage(
  supabase: SupabaseClient,
  from: number,
  to: number,
): Promise<RecipeBackfillRow[]> {
  const query = supabase
    .from('recipes')
    .select('id, external_id, raw_payload')
    .order('external_id', { ascending: true })
    .range(from, to);
  const { data, error } = (await query) as SelectRecipesResult;

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function backfillRow(
  supabase: SupabaseClient,
  row: RecipeBackfillRow,
  summary: BackfillSummary,
): Promise<void> {
  try {
    const result = normalizeSpoonRecipe(row.raw_payload as SpoonRecipe);
    const { error } = (await supabase.rpc('import_recipe_graph', {
      payload: buildGraphPayload(result),
    })) as RpcResult;

    if (error) throw new Error(error.message);

    summary.succeeded += 1;
    if (result.recipe.is_complete) summary.complete += 1;
    else summary.incomplete += 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const externalId = row.external_id ?? null;
    summary.failed += 1;
    summary.failures.push({ external_id: externalId, error: message });
    console.warn(`[backfill:graph] external_id=${externalId ?? 'null'} failed: ${message}`);
  }
}

/* istanbul ignore next -- CLI orchestration; logic is in runBackfill. */
async function main(): Promise<void> {
  const { url, serviceRoleKey } = readEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = await runBackfill(supabase);
  process.stdout.write(
    `[backfill:graph] processed=${summary.processed} succeeded=${summary.succeeded} ` +
      `failed=${summary.failed} complete=${summary.complete} incomplete=${summary.incomplete}\n`,
  );
}

/* istanbul ignore if -- CLI bootstrap; only runs when the file is invoked directly. */
if (require.main === module) {
  main().catch((err) => {
    console.error('[backfill:graph] fatal:', err);
    process.exit(0);
  });
}
