// Pod store: memory-only per DESIGN §10.2.
// The active pod is session-scoped and must refetch on cold start — a
// partner could have dissolved the pod while the app was backgrounded
// (FR-P6 / DESIGN §16.1).

import { create } from 'zustand';

type ActivePod = {
  podId: string;
  partnerId: string;
  partnerDisplayName: string;
};

type PodState = {
  activePodId: string | null;
  partnerId: string | null;
  partnerDisplayName: string | null;
  // True after usePodSync detects the caller is no longer a pod_member while
  // we still had an activePodId — i.e. the partner ran dissolve_pod. Cleared
  // when the user acknowledges the resulting banner. See DESIGN §16.1.
  partnerRemoved: boolean;
  setActivePod: (pod: ActivePod) => void;
  clearActivePod: () => void;
  notePartnerRemoved: () => void;
  acknowledgePartnerRemoved: () => void;
};

const initialState = {
  activePodId: null,
  partnerId: null,
  partnerDisplayName: null,
  partnerRemoved: false,
} as const;

export const usePodStore = create<PodState>((set) => ({
  ...initialState,
  setActivePod: (pod) =>
    set({
      activePodId: pod.podId,
      partnerId: pod.partnerId,
      partnerDisplayName: pod.partnerDisplayName,
      partnerRemoved: false,
    }),
  clearActivePod: () => set({ ...initialState }),
  // Reset pod state *and* raise the partner-removed flag in one operation so
  // the UI never sees an intermediate "no pod, no notice" state.
  notePartnerRemoved: () => set({ ...initialState, partnerRemoved: true }),
  acknowledgePartnerRemoved: () => set({ partnerRemoved: false }),
}));

export function __resetPodStoreForTests(): void {
  usePodStore.setState({ ...initialState });
}
