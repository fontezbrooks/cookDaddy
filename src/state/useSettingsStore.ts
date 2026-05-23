// Settings store (P6e) — MMKV-backed mirror of useAuthStore. Drives the
// MATCH-UX §10/§12 "Vibes" toggles:
//
//   • hapticsEnabled (default true) — gates all expo-haptics calls.
//   • soundsEnabled (default false) — gates all expo-audio calls (P8).
//   • animationsEnabled (default true) — when false, useReducedMotion
//     returns true regardless of the OS-level toggle. This is the
//     "Animations off cascades to reduce-motion" rule from §12.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createMmkvStorage } from './mmkv';

type SettingsState = {
  hapticsEnabled: boolean;
  soundsEnabled: boolean;
  animationsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  setSoundsEnabled: (v: boolean) => void;
  setAnimationsEnabled: (v: boolean) => void;
};

const initialState = {
  hapticsEnabled: true,
  soundsEnabled: false,
  animationsEnabled: true,
} as const;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setSoundsEnabled: (v) => set({ soundsEnabled: v }),
      setAnimationsEnabled: (v) => set({ animationsEnabled: v }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => createMmkvStorage('cookdaddy-settings')),
    },
  ),
);

export function __resetSettingsStoreForTests(): Promise<void> {
  useSettingsStore.setState({ ...initialState });
  return (useSettingsStore.persist.rehydrate() ?? Promise.resolve()) as Promise<void>;
}
