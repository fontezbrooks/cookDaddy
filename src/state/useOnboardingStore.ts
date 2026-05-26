import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createMmkvStorage } from './mmkv';

type OnboardingProgress = {
  completed: boolean;
  step: number;
};

type OnboardingState = {
  completedByUser: Record<string, OnboardingProgress>;
  setStep: (userId: string, step: number) => void;
  complete: (userId: string) => void;
};

const initialState = {
  completedByUser: {},
} as const;

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialState,
      setStep: (userId, step) =>
        set((state) => ({
          completedByUser: {
            ...state.completedByUser,
            [userId]: {
              completed: state.completedByUser[userId]?.completed ?? false,
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
              step: state.completedByUser[userId]?.step ?? 2,
            },
          },
        })),
    }),
    {
      name: 'onboarding-store',
      storage: createJSONStorage(() => createMmkvStorage('cookdaddy-onboarding')),
    },
  ),
);

export function __resetOnboardingStoreForTests(): Promise<void> {
  useOnboardingStore.setState({ ...initialState });
  return (useOnboardingStore.persist.rehydrate() ?? Promise.resolve()) as Promise<void>;
}
