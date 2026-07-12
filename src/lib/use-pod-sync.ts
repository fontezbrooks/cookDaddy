// Keeps the in-memory usePodStore in sync with server-side truth via the
// get_my_pod() RPC (single authoritative read — docs/POD-READ-PATH/README.md).
// Runs on mount and whenever the app foregrounds. Four transitions:
//
//   1. Remote pod present → set pod + partner (partner arrives inline with
//      the membership row, so there is no second lookup to race).
//   2. Remote pod missing, local pod present → partner ran dissolve_pod;
//      raise partnerRemoved so the home screen can render the banner.
//   3. Remote pod missing, local pod missing → server-confirmed podless
//      (syncStatus 'ready'; Home may now safely show "No pod yet").
//   4. Read failed → syncStatus 'error' (known pod state is preserved) and a
//      pod_membership_read_failed analytics event so silent read failures
//      are observable in prod (FR-6).
//
// Spec: docs/DESIGN/README.md §16.1, docs/WORKFLOW/README.md §8.

import { useAuth } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAnalytics } from '@/lib/analytics';
import { usePodMembershipQuery } from '@/lib/use-pod-membership';
import { usePodStore } from '@/state/usePodStore';

export function usePodSync(): void {
  const { userId, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { capture } = useAnalytics();

  const membership = usePodMembershipQuery();
  const membershipError = membership.isError ? membership.error : null;

  useEffect(() => {
    if (membershipError) {
      usePodStore.getState().noteSyncError();
      capture('pod_membership_read_failed', {
        message: membershipError instanceof Error ? membershipError.message : 'unknown',
      });
      return;
    }
    if (membership.data === undefined) return;

    const { podId, partnerId, partnerDisplayName } = membership.data;
    const state = usePodStore.getState();

    if (podId) {
      state.setActivePod({
        podId,
        partnerId: partnerId ?? '',
        partnerDisplayName: partnerDisplayName || 'Your partner',
      });
    } else if (state.activePodId) {
      state.notePartnerRemoved();
    } else {
      state.noteSyncedEmpty();
    }
  }, [membership.data, membershipError, capture]);

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
