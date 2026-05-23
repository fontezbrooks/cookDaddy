// Keeps the in-memory usePodStore in sync with the server-side pod_members
// truth: on mount and whenever the app foregrounds, query the caller's
// active pod and reconcile. Three transitions matter:
//
//   1. Remote pod present, store empty       → set the pod + partner.
//   2. Remote pod differs from local pod     → re-set the pod + partner.
//   3. Remote pod missing, local pod present → partner ran dissolve_pod;
//      raise partnerRemoved so the home screen can render the banner.
//
// Spec: docs/DESIGN/README.md §16.1, docs/WORKFLOW/README.md §8.

import { useAuth } from '@clerk/clerk-expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { fetchPartnerForPod, PodRpcError } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

type Membership = { podId: string | null };

export function usePodSync(): void {
  const { userId, getToken, isSignedIn } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const queryClient = useQueryClient();

  const membership = useQuery({
    queryKey: ['pod-membership', userId],
    enabled: Boolean(isSignedIn && userId),
    staleTime: 30_000,
    queryFn: async (): Promise<Membership> => {
      const { data, error } = await supabase
        .from('pod_members')
        .select('pod_id, pods!inner(archived_at)')
        .eq('user_id', userId as string)
        .is('pods.archived_at', null)
        .maybeSingle();
      if (error) throw new PodRpcError('unknown', error.message);
      const row = data as { pod_id?: string } | null;
      return { podId: row?.pod_id ?? null };
    },
  });

  useEffect(() => {
    if (membership.data === undefined) return;
    const remotePodId = membership.data.podId;
    const localPodId = usePodStore.getState().activePodId;

    if (remotePodId && remotePodId !== localPodId) {
      fetchPartnerForPod(supabase, remotePodId, userId as string)
        .then((partner) => {
          usePodStore.getState().setActivePod({
            podId: remotePodId,
            partnerId: partner?.partnerId ?? '',
            partnerDisplayName: partner?.partnerDisplayName ?? 'Your partner',
          });
        })
        .catch(() => {
          // Partner row not yet visible (RLS race on a brand-new pod) — next
          // refetch will retry. Leaving the store untouched is correct here.
        });
    } else if (!remotePodId && localPodId) {
      usePodStore.getState().notePartnerRemoved();
    }
  }, [membership.data, supabase, userId]);

  useEffect(() => {
    if (!isSignedIn) return;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        queryClient.invalidateQueries({ queryKey: ['pod-membership', userId] });
      }
    });
    return () => sub.remove();
  }, [isSignedIn, queryClient, userId]);
}
