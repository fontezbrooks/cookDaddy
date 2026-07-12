import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getMyPod } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';

export type PodMembership = {
  podId: string | null;
  partnerId: string | null;
  partnerDisplayName: string | null;
  memberCount: number;
};

const NO_POD: PodMembership = {
  podId: null,
  partnerId: null,
  partnerDisplayName: null,
  memberCount: 0,
};

// Single authoritative read of the caller's active pod via the get_my_pod()
// SECURITY DEFINER RPC (migration 027) — the same identity-resolution path as
// every pod mutation. The previous PostgREST + RLS read could silently return
// zero rows and desync the client from the server (the "No pod yet" vs
// already_in_a_pod split-brain); an RPC failure now surfaces as a query error
// instead of masquerading as "no pod". docs/POD-READ-PATH/README.md FR-1.
export function usePodMembershipQuery() {
  const { userId, getToken, isSignedIn } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  return useQuery({
    queryKey: ['pod-membership', userId],
    enabled: Boolean(isSignedIn && userId),
    staleTime: 30_000,
    queryFn: async (): Promise<PodMembership> => (await getMyPod(supabase)) ?? NO_POD,
  });
}
