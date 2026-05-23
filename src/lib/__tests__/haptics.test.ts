/**
 * Haptics wrapper (P6e). Owns the "should this haptic fire?" decision
 * exactly once, in one place — every caller in the codebase just calls
 * `haptics.impactLight()` etc. without worrying about settings/a11y.
 *
 * Rules (MATCH-UX §5 + §10):
 *   • When useSettingsStore.hapticsEnabled === false → no-op all calls.
 *   • Otherwise → forward to expo-haptics with the right style/type.
 */

import * as ExpoHaptics from 'expo-haptics';

import { haptics } from '@/lib/haptics';
import { __resetSettingsStoreForTests, useSettingsStore } from '@/state/useSettingsStore';

const impactAsync = ExpoHaptics.impactAsync as jest.Mock;
const selectionAsync = ExpoHaptics.selectionAsync as jest.Mock;
const notificationAsync = ExpoHaptics.notificationAsync as jest.Mock;

describe('haptics', () => {
  beforeEach(async () => {
    await __resetSettingsStoreForTests();
    impactAsync.mockClear();
    selectionAsync.mockClear();
    notificationAsync.mockClear();
  });

  it('impactLight forwards to expo-haptics with style=Light when haptics are enabled', () => {
    haptics.impactLight();
    expect(impactAsync).toHaveBeenCalledWith('light');
  });

  it('impactHeavy forwards with style=Heavy', () => {
    haptics.impactHeavy();
    expect(impactAsync).toHaveBeenCalledWith('heavy');
  });

  it('selection forwards to selectionAsync', () => {
    haptics.selection();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('notificationSuccess forwards to notificationAsync with type=Success', () => {
    haptics.notificationSuccess();
    expect(notificationAsync).toHaveBeenCalledWith('success');
  });

  it('no-ops every method when hapticsEnabled is false', () => {
    useSettingsStore.getState().setHapticsEnabled(false);
    haptics.impactLight();
    haptics.impactHeavy();
    haptics.selection();
    haptics.notificationSuccess();
    expect(impactAsync).not.toHaveBeenCalled();
    expect(selectionAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
  });
});
