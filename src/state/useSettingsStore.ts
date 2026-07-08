// Settings store (P6e) — MMKV-backed mirror of useAuthStore. Drives the
// MATCH-UX §10/§12 "Vibes" toggles:
//
//   • hapticsEnabled (default true) — gates all expo-haptics calls.
//   • soundsEnabled (default false) — gates all expo-audio calls (P8).
//   • animationsEnabled (default true) — when false, useReducedMotion
//     returns true regardless of the OS-level toggle. This is the
//     "Animations off cascades to reduce-motion" rule from §12.
//   • analyticsEnabled (default true) — opt-out analytics consent.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createPersistentStorage } from './persistent-storage';

type SettingsState = {
  hapticsEnabled: boolean;
  soundsEnabled: boolean;
  animationsEnabled: boolean;
  analyticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  setSoundsEnabled: (v: boolean) => void;
  setAnimationsEnabled: (v: boolean) => void;
  setAnalyticsEnabled: (v: boolean) => void;
};

const initialState = {
  hapticsEnabled: true,
  soundsEnabled: false,
  animationsEnabled: true,
  analyticsEnabled: true,
} as const;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setSoundsEnabled: (v) => set({ soundsEnabled: v }),
      setAnimationsEnabled: (v) => set({ animationsEnabled: v }),
      setAnalyticsEnabled: (v) => set({ analyticsEnabled: v }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => createPersistentStorage()),
    },
  ),
);

export function __resetSettingsStoreForTests(): Promise<void> {
  useSettingsStore.setState({ ...initialState });
  return (useSettingsStore.persist.rehydrate() ?? Promise.resolve()) as Promise<void>;
}
