import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createMmkvStorage } from './mmkv';

type PushPrimingState = {
  promptedAt: number | null;
  setPromptedAt: (ts: number) => void;
};

const initialState = { promptedAt: null } as const;

export const usePushPrimingStore = create<PushPrimingState>()(
  persist(
    (set) => ({
      ...initialState,
      setPromptedAt: (ts) => set({ promptedAt: ts }),
    }),
    {
      name: 'push-priming-store',
      storage: createJSONStorage(() => createMmkvStorage('cookdaddy-push-priming')),
    },
  ),
);

export function __resetPushPrimingStoreForTests(): Promise<void> {
  usePushPrimingStore.setState({ ...initialState });
  return (usePushPrimingStore.persist.rehydrate() ?? Promise.resolve()) as Promise<void>;
}
