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
  setActivePod: (pod: ActivePod) => void;
  clearActivePod: () => void;
};

const initialState = {
  activePodId: null,
  partnerId: null,
  partnerDisplayName: null,
} as const;

export const usePodStore = create<PodState>((set) => ({
  ...initialState,
  setActivePod: (pod) =>
    set({
      activePodId: pod.podId,
      partnerId: pod.partnerId,
      partnerDisplayName: pod.partnerDisplayName,
    }),
  clearActivePod: () => set({ ...initialState }),
}));

export function __resetPodStoreForTests(): void {
  usePodStore.setState({ ...initialState });
}
