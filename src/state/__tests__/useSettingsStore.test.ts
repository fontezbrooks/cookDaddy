/**
 * Settings store contract (P6e, MATCH-UX §12). MMKV-backed mirror of
 * useAuthStore. Three boolean toggles drive cascade behavior in the
 * haptics wrapper and the match overlay:
 *
 *   • hapticsEnabled (default true) — gates all expo-haptics calls
 *   • soundsEnabled (default false) — gates all expo-audio calls (P8)
 *   • animationsEnabled (default true) — when false, useReducedMotion
 *     reports true regardless of OS toggle (MATCH-UX §12)
 */

import { __resetSettingsStoreForTests, useSettingsStore } from '@/state/useSettingsStore';

describe('useSettingsStore', () => {
  beforeEach(async () => {
    await __resetSettingsStoreForTests();
  });

  it('starts with hapticsEnabled=true, soundsEnabled=false, animationsEnabled=true', () => {
    const s = useSettingsStore.getState();
    expect(s.hapticsEnabled).toBe(true);
    expect(s.soundsEnabled).toBe(false);
    expect(s.animationsEnabled).toBe(true);
  });

  it('toggleHaptics flips just hapticsEnabled', () => {
    useSettingsStore.getState().setHapticsEnabled(false);
    expect(useSettingsStore.getState().hapticsEnabled).toBe(false);
    expect(useSettingsStore.getState().soundsEnabled).toBe(false);
    expect(useSettingsStore.getState().animationsEnabled).toBe(true);
  });

  it('toggleSounds flips just soundsEnabled', () => {
    useSettingsStore.getState().setSoundsEnabled(true);
    expect(useSettingsStore.getState().soundsEnabled).toBe(true);
    expect(useSettingsStore.getState().hapticsEnabled).toBe(true);
  });

  it('toggleAnimations flips just animationsEnabled', () => {
    useSettingsStore.getState().setAnimationsEnabled(false);
    expect(useSettingsStore.getState().animationsEnabled).toBe(false);
    expect(useSettingsStore.getState().hapticsEnabled).toBe(true);
  });

  it('persists across rehydration', async () => {
    useSettingsStore.getState().setHapticsEnabled(false);
    useSettingsStore.getState().setSoundsEnabled(true);
    // Hard-rehydrate from MMKV to simulate a cold start.
    await (useSettingsStore.persist.rehydrate() ?? Promise.resolve());
    expect(useSettingsStore.getState().hapticsEnabled).toBe(false);
    expect(useSettingsStore.getState().soundsEnabled).toBe(true);
  });
});
