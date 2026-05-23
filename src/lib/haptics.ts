// Haptics wrapper (P6e). One place owns the "should this haptic fire?"
// decision. Every caller in the codebase just invokes the relevant method
// and the wrapper checks useSettingsStore.hapticsEnabled before forwarding
// to expo-haptics. MATCH-UX §5 + §10/§12 invariants.
//
// The wrapper is intentionally NOT a hook — it's read-anywhere, including
// inside Reanimated worklet callbacks via runOnJS where hook calls would
// be ill-formed. The store read is a synchronous snapshot.

import * as ExpoHaptics from 'expo-haptics';

import { useSettingsStore } from '@/state/useSettingsStore';

function enabled(): boolean {
  return useSettingsStore.getState().hapticsEnabled;
}

export const haptics = {
  impactLight(): void {
    if (!enabled()) return;
    void ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
  },
  impactHeavy(): void {
    if (!enabled()) return;
    void ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy);
  },
  selection(): void {
    if (!enabled()) return;
    void ExpoHaptics.selectionAsync();
  },
  notificationSuccess(): void {
    if (!enabled()) return;
    void ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
  },
};
