// Pod store: memory-only per DESIGN §10.2.
// The active pod is session-scoped and must refetch on cold start — a
// partner could have dissolved the pod while the app was backgrounded
// (FR-P6 / DESIGN §16.1).
//
// syncStatus makes the read's health a first-class state
// (docs/POD-READ-PATH/README.md FR-2): 'unknown' until the first server read
// resolves, 'error' when the read failed (existing pod fields are preserved),
// 'ready' once the server has confirmed the current membership. The UI must
// not render "No pod yet" unless syncStatus is 'ready'.

import { create } from 'zustand';

type ActivePod = {
  podId: string;
  partnerId: string;
  partnerDisplayName: string;
};

export type PodSyncStatus = 'unknown' | 'error' | 'ready';

type PodState = {
  activePodId: string | null;
  partnerId: string | null;
  partnerDisplayName: string | null;
  // True after usePodSync detects the caller is no longer a pod_member while
  // we still had an activePodId — i.e. the partner ran dissolve_pod. Cleared
  // when the user acknowledges the resulting banner. See DESIGN §16.1.
  partnerRemoved: boolean;
  syncStatus: PodSyncStatus;
  setActivePod: (pod: ActivePod) => void;
  clearActivePod: () => void;
  notePartnerRemoved: () => void;
  acknowledgePartnerRemoved: () => void;
  noteSyncError: () => void;
  noteSyncedEmpty: () => void;
};

const initialState = {
  activePodId: null,
  partnerId: null,
  partnerDisplayName: null,
  partnerRemoved: false,
  syncStatus: 'unknown' as PodSyncStatus,
};

export const usePodStore = create<PodState>((set) => ({
  ...initialState,
  setActivePod: (pod) =>
    set({
      activePodId: pod.podId,
      partnerId: pod.partnerId,
      partnerDisplayName: pod.partnerDisplayName,
      partnerRemoved: false,
      syncStatus: 'ready',
    }),
  // User-initiated leave: we know we're podless, so the state is 'ready'.
  clearActivePod: () => set({ ...initialState, syncStatus: 'ready' }),
  // Reset pod state *and* raise the partner-removed flag in one operation so
  // the UI never sees an intermediate "no pod, no notice" state.
  notePartnerRemoved: () => set({ ...initialState, partnerRemoved: true, syncStatus: 'ready' }),
  acknowledgePartnerRemoved: () => set({ partnerRemoved: false }),
  // A failed read must NOT clear known pod state — only flag the failure.
  noteSyncError: () => set({ syncStatus: 'error' }),
  // Server confirmed "no pod" while we also had none locally.
  noteSyncedEmpty: () => set({ ...initialState, syncStatus: 'ready' }),
}));

export function __resetPodStoreForTests(): void {
  usePodStore.setState({ ...initialState });
}
