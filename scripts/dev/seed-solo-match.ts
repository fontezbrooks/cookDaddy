// LOCAL-ONLY DEV FIXTURE.
//
// Requires local Supabase plus a service-role key from script-side env:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
//   DEV_USER_ID=user_... pnpm dev:seed-match
//
// This script refuses non-local Supabase URLs. Never run it against production,
// never import it from app code, and never expose SUPABASE_SERVICE_ROLE_KEY via
// EXPO_PUBLIC_* variables.
//
// Usage:
//   1. Start/reset local Supabase with seeded recipes.
//   2. Sign into the Expo app as the dev user.
//   3. Run `DEV_USER_ID=<signed-in Clerk user id> pnpm dev:seed-match`.
//   4. Open the printed `/session/<id>` or tap "DEV: solo match" on Home.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SYNTHETIC_PARTNER_ID = 'dev_solo_match_partner';
const SYNTHETIC_PARTNER_NAME = 'DEV Solo Partner';
const DEFAULT_DECK_SIZE = 10;

type ActivePod = {
  id: string;
  memberIds: string[];
};

type Env = {
  url: string;
  serviceRoleKey: string;
  devUserId: string;
  deckSize: number;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireLocalUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to seed non-local Supabase URL (${rawUrl}). Use SUPABASE_URL=http://127.0.0.1:54321.`,
    );
  }
  return rawUrl;
}

function readEnv(): Env {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const devUserId = readArg('dev-user-id') ?? process.env.DEV_USER_ID;
  const rawDeckSize = readArg('deck-size') ?? process.env.DEV_DECK_SIZE;
  const deckSize = rawDeckSize ? Number(rawDeckSize) : DEFAULT_DECK_SIZE;

  if (!rawUrl) throw new Error('SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) is required');
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required and must only be provided to this script',
    );
  }
  if (!devUserId) {
    throw new Error('DEV_USER_ID is required (or pass --dev-user-id <signed-in Clerk user id>)');
  }
  if (!Number.isInteger(deckSize) || deckSize < 1) {
    throw new Error('DEV_DECK_SIZE / --deck-size must be a positive integer');
  }

  return {
    url: requireLocalUrl(rawUrl),
    serviceRoleKey,
    devUserId,
    deckSize: Math.min(Math.max(deckSize, 5), 50),
  };
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function ensureUsers(supabase: SupabaseClient, devUserId: string): Promise<void> {
  const { error } = await supabase.from('users').upsert(
    [
      {
        id: devUserId,
        display_name: 'DEV User',
        avatar_url: null,
      },
      {
        id: SYNTHETIC_PARTNER_ID,
        display_name: SYNTHETIC_PARTNER_NAME,
        avatar_url: null,
      },
    ],
    { onConflict: 'id', ignoreDuplicates: false },
  );
  throwIfError(error, 'failed to ensure dev fixture users');
}

async function readActivePodsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActivePod[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('pod_members')
    .select('pod_id')
    .eq('user_id', userId);
  throwIfError(membershipError, `failed to read pod memberships for ${userId}`);

  const podIds = [...new Set((memberships ?? []).map((row) => row.pod_id as string))];
  if (podIds.length === 0) return [];

  const { data: pods, error: podError } = await supabase
    .from('pods')
    .select('id, archived_at')
    .in('id', podIds)
    .is('archived_at', null);
  throwIfError(podError, `failed to read active pods for ${userId}`);

  const activePodIds = (pods ?? []).map((row) => row.id as string);
  if (activePodIds.length === 0) return [];

  const { data: members, error: membersError } = await supabase
    .from('pod_members')
    .select('pod_id, user_id')
    .in('pod_id', activePodIds);
  throwIfError(membersError, 'failed to read active pod members');

  return activePodIds.map((id) => ({
    id,
    memberIds: (members ?? [])
      .filter((row) => row.pod_id === id)
      .map((row) => row.user_id as string),
  }));
}

async function ensureSoloPod(supabase: SupabaseClient, devUserId: string): Promise<string> {
  const activePods = await readActivePodsForUser(supabase, devUserId);
  const soloPod = activePods.find((pod) => {
    const members = new Set(pod.memberIds);
    return members.size === 2 && members.has(devUserId) && members.has(SYNTHETIC_PARTNER_ID);
  });
  if (soloPod) return soloPod.id;

  if (activePods.length > 0) {
    throw new Error(
      `DEV_USER_ID already belongs to active pod ${activePods[0]?.id}; archive it locally before seeding the solo-match fixture.`,
    );
  }

  const { data: pod, error: podError } = await supabase
    .from('pods')
    .insert({})
    .select('id')
    .single();
  throwIfError(podError, 'failed to create dev solo pod');
  if (!pod) throw new Error('failed to create dev solo pod: no row returned');

  const podId = pod.id as string;
  const { error: memberError } = await supabase.from('pod_members').insert([
    { pod_id: podId, user_id: devUserId },
    { pod_id: podId, user_id: SYNTHETIC_PARTNER_ID },
  ]);
  throwIfError(memberError, 'failed to create dev solo pod memberships');

  return podId;
}

async function computeDeck(
  supabase: SupabaseClient,
  podId: string,
  deckSize: number,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('compute_session_deck', {
    p_pod_id: podId,
    p_deck_size: deckSize,
  });
  throwIfError(error, 'failed to compute session deck');

  const deck = (data ?? []) as string[];
  if (deck.length === 0) {
    throw new Error(
      'compute_session_deck returned an empty deck; seed local complete recipes first',
    );
  }
  return deck;
}

async function createSession(
  supabase: SupabaseClient,
  podId: string,
  devUserId: string,
  deckRecipeIds: string[],
): Promise<string> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      pod_id: podId,
      started_by: devUserId,
      status: 'lobby',
      deck_recipe_ids: deckRecipeIds,
    })
    .select('id')
    .single();
  throwIfError(error, 'failed to insert dev solo-match session');
  if (!data) throw new Error('failed to insert dev solo-match session: no row returned');

  return data.id as string;
}

async function seedPartnerRightSwipes(
  supabase: SupabaseClient,
  sessionId: string,
  podId: string,
  recipeIds: string[],
): Promise<void> {
  const { error } = await supabase.from('swipes').upsert(
    recipeIds.map((recipeId) => ({
      session_id: sessionId,
      pod_id: podId,
      user_id: SYNTHETIC_PARTNER_ID,
      recipe_id: recipeId,
      direction: 'right',
    })),
    { onConflict: 'session_id,user_id,recipe_id', ignoreDuplicates: false },
  );
  throwIfError(error, 'failed to pre-insert synthetic partner right swipes');
}

async function main(): Promise<void> {
  const env = readEnv();
  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  await ensureUsers(supabase, env.devUserId);
  const podId = await ensureSoloPod(supabase, env.devUserId);
  const deckRecipeIds = await computeDeck(supabase, podId, env.deckSize);
  const sessionId = await createSession(supabase, podId, env.devUserId, deckRecipeIds);
  await seedPartnerRightSwipes(supabase, sessionId, podId, deckRecipeIds);

  console.log(`Seeded DEV solo-match fixture`);
  console.log(`pod_id: ${podId}`);
  console.log(`session_id: ${sessionId}`);
  console.log(`deck_size: ${deckRecipeIds.length}`);
  console.log(`Open /session/${sessionId} or tap "DEV: solo match" on Home.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
