import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { PodRpcError } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';

export type PodMembership = { podId: string | null };

// Authoritative server read of the caller's active pod. RLS (pm_read /
// pods_member_read) already scopes pod_members to the caller's own pod, so we
// do NOT filter by user_id on the client — that filter assumed Clerk's userId
// byte-matches the stored pod_members.user_id and could silently return null,
// desyncing the client store from the server (Settings said "no pod" while the
// server rejected joins with already_in_a_pod). limit(1) collapses the self+
// partner rows (same pod_id) so maybeSingle never trips on 2 rows.
export function usePodMembershipQuery() {
  const { userId, getToken, isSignedIn } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  return useQuery({
    queryKey: ['pod-membership', userId],
    enabled: Boolean(isSignedIn && userId),
    staleTime: 30_000,
    queryFn: async (): Promise<PodMembership> => {
      const { data, error } = await supabase
        .from('pod_members')
        .select('pod_id, pods!inner(archived_at)')
        .is('pods.archived_at', null)
        .limit(1)
        .maybeSingle();
      if (error) throw new PodRpcError('unknown', error.message);
      const row = data as { pod_id?: string } | null;
      return { podId: row?.pod_id ?? null };
    },
  });
}
