// Typed wrappers around the P5 pod-lifecycle RPCs (supabase/migrations/017).
//
// Each RPC raises pgSQL exceptions with a stable message string (see 017);
// the wrappers re-throw those as a PodRpcError carrying a discriminated
// `code` so callers can render variant copy without parsing strings.

import type { SupabaseClient } from '@supabase/supabase-js';

export type PodInvite = {
  token: string;
  expiresAt: string;
  podId: string;
};

export type ConsumeResult = {
  podId: string;
  alreadyMember: boolean;
};

export type Partner = {
  partnerId: string;
  partnerDisplayName: string;
};

export type PodRpcErrorCode =
  | 'invite_not_found'
  | 'invite_expired'
  | 'invite_already_consumed'
  | 'cannot_consume_own_invite'
  | 'consumer_already_in_a_pod'
  | 'already_in_a_pod'
  | 'not_member'
  | 'unauthenticated'
  | 'unknown';

const KNOWN_CODES: ReadonlySet<PodRpcErrorCode> = new Set<PodRpcErrorCode>([
  'invite_not_found',
  'invite_expired',
  'invite_already_consumed',
  'cannot_consume_own_invite',
  'consumer_already_in_a_pod',
  'already_in_a_pod',
  'not_member',
  'unauthenticated',
]);

export class PodRpcError extends Error {
  constructor(
    public readonly code: PodRpcErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PodRpcError';
  }
}

function codeFromMessage(message: string | undefined): PodRpcErrorCode {
  if (message && (KNOWN_CODES as Set<string>).has(message)) {
    return message as PodRpcErrorCode;
  }
  return 'unknown';
}

export async function createPodInvite(supabase: SupabaseClient): Promise<PodInvite> {
  const { data, error } = await supabase.rpc('create_pod_invite');
  if (error) {
    throw new PodRpcError(codeFromMessage(error.message), error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token || !row?.expires_at || !row?.pod_id) {
    throw new PodRpcError('unknown', 'create_pod_invite returned empty result');
  }
  return { token: row.token, expiresAt: row.expires_at, podId: row.pod_id };
}

export async function consumePodInvite(
  supabase: SupabaseClient,
  token: string,
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc('consume_pod_invite', { p_token: token });
  if (error) {
    throw new PodRpcError(codeFromMessage(error.message), error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.pod_id) {
    throw new PodRpcError('unknown', 'consume_pod_invite returned empty result');
  }
  return { podId: row.pod_id, alreadyMember: Boolean(row.already_member) };
}

export async function dissolvePod(supabase: SupabaseClient, podId: string): Promise<void> {
  const { error } = await supabase.rpc('dissolve_pod', { p_pod_id: podId });
  if (error) {
    throw new PodRpcError(codeFromMessage(error.message), error.message);
  }
}

// fetchPartnerForPod: returns the partner's row from pod_members + users for
// the given pod. Returns null if the caller is the sole member (invite not yet
// consumed) or the pod is empty. RLS allows reading partner rows because
// users_self_or_partner_read covers it.
export async function fetchPartnerForPod(
  supabase: SupabaseClient,
  podId: string,
  selfClerkId: string,
): Promise<Partner | null> {
  const { data, error } = await supabase
    .from('pod_members')
    .select('user_id, users!inner(display_name)')
    .eq('pod_id', podId)
    .neq('user_id', selfClerkId)
    .maybeSingle();
  if (error) {
    throw new PodRpcError('unknown', error.message);
  }
  if (!data) return null;
  const partnerId = (data as { user_id: string }).user_id;
  const usersField = (data as { users: unknown }).users;
  const usersObj = Array.isArray(usersField) ? usersField[0] : usersField;
  const displayName =
    usersObj && typeof usersObj === 'object' && 'display_name' in usersObj
      ? String((usersObj as { display_name: unknown }).display_name ?? '')
      : '';
  return { partnerId, partnerDisplayName: displayName };
}
