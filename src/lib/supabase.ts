// Supabase client wired to Clerk-issued JWTs.
//
// Supabase-js v2.45+ accepts `accessToken` — an async function that returns the
// bearer the client should attach to every REST + Realtime request. We point that
// at Clerk's `getToken()` (no template): Clerk signs the default session token
// with its own keypair and publishes the public JWKS at its issuer domain. Supabase
// is configured as a third-party-auth consumer that fetches and trusts that JWKS,
// so no shared secret is exchanged.
//
// Spec: docs/DESIGN/README.md §4.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

export type ClerkTokenFetcher = () => Promise<string | null>;

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function readConfig(): { url: string; anonKey: string } {
  // Read at call time, not at module load: lets tests mutate the source after import,
  // and means an OTA-updated app.config picks up new values without a reload.
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  const url = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not configured');
  }
  if (!anonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured');
  }
  return { url, anonKey };
}

// Build a Supabase client that fetches the auth token from Clerk on every request.
//
// Why a factory and not a global singleton? `getToken` comes from Clerk's
// `useAuth()` hook, which is only valid inside React tree. Callers that need the
// client outside a component (rare in v1) can construct it once and reuse.
export function createSupabaseClient(getToken: ClerkTokenFetcher): SupabaseClient {
  const { url, anonKey } = readConfig();
  return createClient(url, anonKey, {
    auth: {
      // Clerk is the source of truth for sessions — Supabase auth is off.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    accessToken: async () => {
      const token = await getToken();
      return token ?? null;
    },
  });
}

// Ensure the `users` row for the current Clerk identity exists. This is the
// client-side fallback path called from the post-sign-in effect — if the Clerk
// webhook (clerk-user-webhook) has already synced this user, the upsert is a no-op.
// RLS policy `users_self_insert` permits insert iff `id = auth_user_id()`, so the
// caller can only create *their own* row here.
export async function ensureSelfUserRow(
  supabase: SupabaseClient,
  identity: { id: string; displayName: string; avatarUrl?: string | null },
): Promise<void> {
  const { error } = await supabase.from('users').upsert(
    {
      id: identity.id,
      display_name: identity.displayName,
      avatar_url: identity.avatarUrl ?? null,
    },
    { onConflict: 'id', ignoreDuplicates: false },
  );
  if (error) {
    throw new Error(`failed to ensure user row: ${error.message}`);
  }
}
