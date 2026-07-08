// Keeps the in-memory usePodStore in sync with the server-side pod_members
// truth: on mount and whenever the app foregrounds, query the caller's
// active pod and reconcile. Three transitions matter:
//
//   1. Remote pod present, store empty       → set the pod + partner.
//   2. Remote pod differs from local pod     → re-set the pod + partner.
//      Remote matches local but partner is unknown also refetches, covering a
//      solo pod that gains a partner without changing pod id.
//   3. Remote pod missing, local pod present → partner ran dissolve_pod;
//      raise partnerRemoved so the home screen can render the banner.
//
// Spec: docs/DESIGN/README.md §16.1, docs/WORKFLOW/README.md §8.

import { useAuth } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { usePodMembershipQuery } from '@/lib/use-pod-membership';
import { fetchPartnerForPod } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

export function usePodSync(): void {
  const { userId, getToken, isSignedIn } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const queryClient = useQueryClient();

  const membership = usePodMembershipQuery();

  useEffect(() => {
    if (membership.data === undefined) return;
    const remotePodId = membership.data.podId;
    const state = usePodStore.getState();
    const localPodId = state.activePodId;
    const localPartnerId = state.partnerId;

    // Fetch/reconcile the partner when we see a NEW pod, OR when we're on the
    // same pod but haven't resolved a partner yet. A solo pod the inviter
    // already synced stores partnerId '' and keeps the same pod id after the
    // partner joins, so a pod-id-only check would never fill the partner in and
    // Home would stay stuck in the pending-invite state.
    if (remotePodId && (remotePodId !== localPodId || !localPartnerId)) {
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
