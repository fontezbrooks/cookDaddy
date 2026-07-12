// Typed wrappers around the pod-lifecycle RPCs (supabase/migrations/017/025/
// 026/027). Reads AND writes both go through SECURITY DEFINER RPCs so the
// client never depends on RLS visibility for membership truth
// (docs/POD-READ-PATH/README.md).
//
// Each RPC raises pgSQL exceptions with a stable message string; the wrappers
// re-throw those as a PodRpcError carrying a discriminated `code` so callers
// can render variant copy without parsing strings.

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

export type MyPod = {
  podId: string;
  partnerId: string | null;
  partnerDisplayName: string | null;
  memberCount: number;
};

export type PodRpcErrorCode =
  | 'invite_not_found'
  | 'invite_expired'
  | 'invite_already_consumed'
  | 'cannot_consume_own_invite'
  | 'consumer_already_in_a_pod'
  | 'pod_full'
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
  'pod_full',
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

// getMyPod: authoritative read of the caller's active pod (027). Partner and
// member count arrive inline, so there is no second lookup to race. Returns
// null when the caller has no active pod.
export async function getMyPod(supabase: SupabaseClient): Promise<MyPod | null> {
  const { data, error } = await supabase.rpc('get_my_pod');
  if (error) {
    throw new PodRpcError(codeFromMessage(error.message), error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.pod_id) return null;
  return {
    podId: row.pod_id,
    partnerId: row.partner_user_id ?? null,
    partnerDisplayName: row.partner_display_name ?? null,
    memberCount: Number(row.member_count ?? 0),
  };
}

// leaveMyPod: no-arg escape hatch (027). The server resolves the caller's
// membership itself, so this works even when the client store is empty.
// Resolves true when a pod was dissolved, false when there was none.
export async function leaveMyPod(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('leave_my_pod');
  if (error) {
    throw new PodRpcError(codeFromMessage(error.message), error.message);
  }
  return Boolean(data);
}
