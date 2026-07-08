import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createPersistentStorage } from './persistent-storage';

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
      storage: createJSONStorage(() => createPersistentStorage()),
    },
  ),
);

export function __resetPushPrimingStoreForTests(): Promise<void> {
  usePushPrimingStore.setState({ ...initialState });
  return (usePushPrimingStore.persist.rehydrate() ?? Promise.resolve()) as Promise<void>;
}
