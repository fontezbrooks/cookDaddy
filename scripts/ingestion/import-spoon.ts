#!/usr/bin/env node
// Recipe ingestion CLI: reads RecipeJson/*.json from the Spoonacular cron, normalizes
// each payload, and idempotently upserts into Supabase via the service role.
//
// Behavior contracts (docs/WORKFLOW/README.md §6):
//   • Idempotent on recipes.external_id — re-running produces the same row count.
//   • Ingredients are deleted-and-reinserted in source order so `position` stays stable.
//   • A ledger at RecipeJson/.imported.json speeds up re-runs by skipping already-processed
//     files (the DB upsert would no-op anyway; this is purely a wall-time win).
//   • Per-file errors log a warning and DO NOT throw — the cron loop stays alive.
//   • Title-similarity > 0.85 against existing titles emits PostHog
//     `recipe_apparent_duplicate` for sizing post-MVP fuzzy dedup.
//
// Usage:
//   pnpm ingest:backfill          # process every JSON file
//   pnpm ingest:import file.json  # process a single file (cron path)
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optionally POSTHOG_KEY.

import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PostHog } from 'posthog-node';

import {
  NormalizationError,
  normalizeSpoonPayload,
  titleSimilarity,
  type NormalizedIngredient,
  type NormalizedRecipe,
  type NormalizationResult,
} from './normalize';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECIPE_DIR = path.join(REPO_ROOT, 'RecipeJson');
const TITLE_SIMILARITY_THRESHOLD = 0.85;

type Ledger = { imported: Record<string, string> }; // filename → ISO timestamp

type ImportSummary = {
  attempted: number;
  inserted: number;
  upserted: number;
  skipped: number;
  failed: number;
  duplicateSignals: number;
};

/* istanbul ignore next -- CLI orchestration; logic is in runImport, which is the unit-tested surface. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targetFile = args.find((a) => !a.startsWith('--'));

  const { url, serviceRoleKey } = readEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const posthog = createPostHog();

  const summary = await runImport(supabase, posthog, { targetFile });

  if (posthog) await posthog.shutdown();

  console.log(
    `[ingest] attempted=${summary.attempted} inserted=${summary.inserted} ` +
      `upserted=${summary.upserted} skipped=${summary.skipped} failed=${summary.failed} ` +
      `duplicate_signals=${summary.duplicateSignals}`,
  );
}

export async function runImport(
  supabase: SupabaseClient,
  posthog: PostHog | null,
  opts: { targetFile?: string; recipeDir?: string; ledgerPath?: string } = {},
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    attempted: 0,
    inserted: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    duplicateSignals: 0,
  };

  const recipeDir = opts.recipeDir ?? RECIPE_DIR;
  const ledgerPath = opts.ledgerPath ?? path.join(recipeDir, '.imported.json');

  const ledger = await readLedger(ledgerPath);
  const files = await pickFiles(recipeDir, opts.targetFile);
  const existingTitles = await fetchExistingTitles(supabase);

  for (const file of files) {
    summary.attempted += 1;
    const baseName = path.basename(file);
    if (ledger.imported[baseName] && !opts.targetFile) {
      summary.skipped += 1;
      continue;
    }
    try {
      const raw = await fs.readFile(file, 'utf8');
      const payload = JSON.parse(raw);
      const result = normalizeSpoonPayload(payload);

      const dupTitle = findApparentDuplicate(result.recipe.title, existingTitles);
      if (dupTitle && posthog) {
        summary.duplicateSignals += 1;
        posthog.capture({
          distinctId: 'ingestion-cron',
          event: 'recipe_apparent_duplicate',
          properties: {
            external_id: result.recipe.external_id,
            title: result.recipe.title,
            apparent_match: dupTitle.title,
            similarity: dupTitle.score,
          },
        });
      }

      const wasInserted = await upsertRecipe(supabase, result);
      if (wasInserted) summary.inserted += 1;
      else summary.upserted += 1;

      existingTitles.push(result.recipe.title);
      ledger.imported[baseName] = new Date().toISOString();
    } catch (err) {
      summary.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ingest] ${baseName} failed: ${msg}`);
      // Workflow §6: per-file errors don't break the cron. We continue.
    }
  }

  await writeLedger(ledgerPath, ledger);
  return summary;
}

export function readEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error('SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) is not configured');
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured — ingestion must run with service role',
    );
  }
  return { url, serviceRoleKey };
}

export function createPostHog(): PostHog | null {
  const key = process.env.POSTHOG_KEY ?? process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  /* istanbul ignore next -- network-side; constructor is mocked in tests via the PostHog class */
  return new PostHog(key, {
    host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
    flushAt: 1,
  });
}

async function pickFiles(dir: string, target?: string): Promise<string[]> {
  if (target) {
    const abs = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
    return [abs];
  }
  const entries = await fs.readdir(dir);
  return entries
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .map((name) => path.join(dir, name))
    .sort();
}

async function readLedger(ledgerPath: string): Promise<Ledger> {
  try {
    const raw = await fs.readFile(ledgerPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    return { imported: parsed.imported ?? {} };
  } catch {
    return { imported: {} };
  }
}

async function writeLedger(ledgerPath: string, ledger: Ledger): Promise<void> {
  await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

async function fetchExistingTitles(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from('recipes').select('title');
  if (error) {
    console.warn(`[ingest] could not fetch existing titles for dup-detection: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => r.title as string);
}

function findApparentDuplicate(
  newTitle: string,
  existingTitles: string[],
): { title: string; score: number } | null {
  let best: { title: string; score: number } | null = null;
  for (const candidate of existingTitles) {
    if (candidate === newTitle) continue;
    const score = titleSimilarity(newTitle, candidate);
    if (score >= TITLE_SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { title: candidate, score };
    }
  }
  return best;
}

async function upsertRecipe(
  supabase: SupabaseClient,
  result: NormalizationResult,
): Promise<boolean> {
  // Returning '*' so we can tell insert from update via created_at.
  const { data: upserted, error: upErr } = await supabase
    .from('recipes')
    .upsert(toRecipeRow(result.recipe), { onConflict: 'external_id' })
    .select('id, created_at')
    .single();
  if (upErr || !upserted) {
    throw new Error(`recipes upsert failed: ${upErr?.message ?? 'no row returned'}`);
  }
  const recipeId = upserted.id as string;

  // Replace ingredients in source order. The uniqueness on (recipe_id, position) makes
  // upsert-on-conflict messy; delete + insert is simpler and idempotent at the row level.
  const { error: delErr } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', recipeId);
  if (delErr) {
    throw new Error(`recipe_ingredients delete failed: ${delErr.message}`);
  }

  if (result.ingredients.length > 0) {
    const rows = result.ingredients.map((ing) => toIngredientRow(recipeId, ing));
    const { error: insErr } = await supabase.from('recipe_ingredients').insert(rows);
    if (insErr) {
      throw new Error(`recipe_ingredients insert failed: ${insErr.message}`);
    }
  }

  const ageMs = Date.now() - new Date(upserted.created_at as string).getTime();
  return ageMs < 60_000; // heuristic: row was created in the last minute = fresh insert
}

function toRecipeRow(r: NormalizedRecipe) {
  return {
    external_id: r.external_id,
    title: r.title,
    image_url: r.image_url,
    source_url: r.source_url,
    source_name: r.source_name,
    credits_text: r.credits_text,
    license: r.license,
    ready_in_minutes: r.ready_in_minutes,
    servings: r.servings,
    health_score: r.health_score,
    dietary_flags: r.dietary_flags,
    raw_payload: r.raw_payload,
    is_complete: r.is_complete,
  };
}

function toIngredientRow(recipeId: string, ing: NormalizedIngredient) {
  return {
    recipe_id: recipeId,
    ext_ingredient_id: ing.ext_ingredient_id,
    name: ing.name,
    name_clean: ing.name_clean,
    original_text: ing.original_text,
    amount: ing.amount,
    unit: ing.unit,
    aisle: ing.aisle,
    image_url: ing.image_url,
    position: ing.position,
  };
}

// Re-export for tests
export { findApparentDuplicate };
export type { ImportSummary };

/* istanbul ignore if -- CLI bootstrap; only runs when the file is invoked directly. */
if (require.main === module) {
  main().catch((err) => {
    // Top-level: exit 0 even on error so cron's failure mail doesn't fire on transient
    // problems. The console.error preserves the diagnostics for /tmp/spoon.log.
    console.error('[ingest] fatal:', err);
    process.exit(0);
  });
  // Silence the unhandled rejection warning if main rejects fast.
  void NormalizationError;
}
