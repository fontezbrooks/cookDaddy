// Typed wrappers around the P6 swipe-session RPCs (supabase/migrations/018).
// Mirror of src/lib/pod-rpcs.ts — Postgres exception messages are translated
// into a SessionRpcError(code) discriminated union so screens can render
// variant copy without parsing strings.

import type { SupabaseClient } from '@supabase/supabase-js';

export type StartSessionResult = {
  sessionId: string;
  deckRecipeIds: string[];
};

export type SwipeDirection = 'right' | 'left';

export type SubmitSwipeResult = {
  match: boolean;
  matchId: string | null;
  alreadyMatched: boolean;
};

export type SessionEndReason = 'completed' | 'user_ended' | 'partner_disconnect' | 'timeout';

export type SessionRpcErrorCode =
  | 'unauthenticated'
  | 'not_member'
  | 'session_not_found'
  | 'session_not_pending'
  | 'session_not_active'
  | 'forbidden'
  | 'unknown';

const KNOWN_CODES: ReadonlySet<SessionRpcErrorCode> = new Set<SessionRpcErrorCode>([
  'unauthenticated',
  'not_member',
  'session_not_found',
  'session_not_pending',
  'session_not_active',
  'forbidden',
]);

export class SessionRpcError extends Error {
  constructor(
    public readonly code: SessionRpcErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SessionRpcError';
  }
}

function codeFromMessage(message: string | undefined): SessionRpcErrorCode {
  if (message && (KNOWN_CODES as Set<string>).has(message)) {
    return message as SessionRpcErrorCode;
  }
  return 'unknown';
}

export async function startSession(
  supabase: SupabaseClient,
  podId: string,
  deckSize?: number,
): Promise<StartSessionResult> {
  const params =
    deckSize == null ? { p_pod_id: podId } : { p_pod_id: podId, p_deck_size: deckSize };
  const { data, error } = await supabase.rpc('start_session', params);
  if (error) {
    throw new SessionRpcError(codeFromMessage(error.message), error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.session_id) {
    throw new SessionRpcError('unknown', 'start_session returned empty result');
  }
  return {
    sessionId: row.session_id,
    deckRecipeIds: (row.deck_recipe_ids as string[]) ?? [],
  };
}

export type SessionRead = {
  id: string;
  status: 'lobby' | 'active' | 'ended';
  pod_id: string;
  deck_recipe_ids: string[];
  ended_reason: string | null;
  pods: { created_at: string } | null;
};

// getSession: session bootstrap read via the get_session SECURITY DEFINER RPC
// (migration 028). The pod-scoped RLS SELECT returns nothing on device while
// definer RPCs work — same class the pod-membership rebuild (027) fixed, see
// docs/POD-READ-PATH/README.md. Shape mirrors the old embedded select so the
// screen consumes it unchanged. Null = not found OR not a member of the
// session's pod (identical on purpose — no session-id probing).
export async function getSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionRead | null> {
  const { data, error } = await supabase.rpc('get_session', { p_session_id: sessionId });
  if (error) {
    throw new SessionRpcError(codeFromMessage(error.message), error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return null;
  return {
    id: row.id,
    status: row.status as SessionRead['status'],
    pod_id: row.pod_id,
    deck_recipe_ids: (row.deck_recipe_ids as string[]) ?? [],
    ended_reason: (row.ended_reason as string | null) ?? null,
    pods: row.pod_created_at ? { created_at: row.pod_created_at as string } : null,
  };
}

export async function markSessionActive(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_session_active', { p_session_id: sessionId });
  if (error) {
    throw new SessionRpcError(codeFromMessage(error.message), error.message);
  }
}

export async function submitSwipe(
  supabase: SupabaseClient,
  sessionId: string,
  recipeId: string,
  direction: SwipeDirection,
): Promise<SubmitSwipeResult> {
  const { data, error } = await supabase.rpc('submit_swipe', {
    p_session_id: sessionId,
    p_recipe_id: recipeId,
    p_direction: direction,
  });
  if (error) {
    throw new SessionRpcError(codeFromMessage(error.message), error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new SessionRpcError('unknown', 'submit_swipe returned no row');
  }
  return {
    match: Boolean(row.match),
    matchId: (row.match_id as string | null) ?? null,
    alreadyMatched: Boolean(row.already_matched),
  };
}

export async function endSession(
  supabase: SupabaseClient,
  sessionId: string,
  reason: SessionEndReason,
): Promise<void> {
  const { error } = await supabase.rpc('end_session', {
    p_session_id: sessionId,
    p_reason: reason,
  });
  if (error) {
    throw new SessionRpcError(codeFromMessage(error.message), error.message);
  }
}
