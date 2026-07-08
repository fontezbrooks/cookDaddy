import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createPersistentStorage } from './persistent-storage';

type OnboardingProgress = {
  completed: boolean;
  skipped: number;
  step: number;
};

type OnboardingState = {
  completedByUser: Record<string, OnboardingProgress>;
  recordSkip: (userId: string) => number;
  setStep: (userId: string, step: number) => void;
  complete: (userId: string) => void;
};

const initialState = {
  completedByUser: {},
} as const;

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...initialState,
      recordSkip: (userId: string): number => {
        const nextSkipped = (get().completedByUser[userId]?.skipped ?? 0) + 1;
        set((state) => ({
          completedByUser: {
            ...state.completedByUser,
            [userId]: {
              completed: state.completedByUser[userId]?.completed ?? false,
              skipped: nextSkipped,
              step: state.completedByUser[userId]?.step ?? 0,
            },
          },
        }));
        return nextSkipped;
      },
      setStep: (userId, step) =>
        set((state) => ({
          completedByUser: {
            ...state.completedByUser,
            [userId]: {
              completed: state.completedByUser[userId]?.completed ?? false,
              skipped: state.completedByUser[userId]?.skipped ?? 0,
              step,
            },
          },
        })),
      complete: (userId) =>
        set((state) => ({
          completedByUser: {
            ...state.completedByUser,
            [userId]: {
              completed: true,
              skipped: state.completedByUser[userId]?.skipped ?? 0,
              step: state.completedByUser[userId]?.step ?? 2,
            },
          },
        })),
    }),
    {
      name: 'onboarding-store',
      storage: createJSONStorage(() => createPersistentStorage()),
    },
  ),
);

export function __resetOnboardingStoreForTests(): Promise<void> {
  useOnboardingStore.setState({ ...initialState });
  return (useOnboardingStore.persist.rehydrate() ?? Promise.resolve()) as Promise<void>;
}
