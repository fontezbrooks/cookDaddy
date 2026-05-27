/**
 * Vibes screen contract (P6e, MATCH-UX §12). Three toggle rows bound
 * directly to useSettingsStore — flipping a row in the UI persists to
 * MMKV and the haptics wrapper + useReducedMotion read the new value
 * on the next render.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { __resetSettingsStoreForTests, useSettingsStore } from '@/state/useSettingsStore';

import VibesScreen from '../vibes';

const mockCapture = jest.fn();
jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({
    capture: mockCapture,
    identify: jest.fn(),
    group: jest.fn(),
    reset: jest.fn(),
  }),
}));

describe('VibesScreen', () => {
  beforeEach(async () => {
    await __resetSettingsStoreForTests();
    mockCapture.mockReset();
  });

  it('renders three toggle rows with their MATCH-UX defaults', () => {
    render(<VibesScreen />);
    // Haptics ON, Sounds OFF, Animations ON by default.
    expect(screen.getByTestId('vibes-haptics').props.accessibilityState?.checked).toBe(true);
    expect(screen.getByTestId('vibes-sounds').props.accessibilityState?.checked).toBe(false);
    expect(screen.getByTestId('vibes-animations').props.accessibilityState?.checked).toBe(true);
  });

  it('tapping haptics toggle writes the new value to useSettingsStore', () => {
    render(<VibesScreen />);
    fireEvent.press(screen.getByTestId('vibes-haptics'));
    expect(useSettingsStore.getState().hapticsEnabled).toBe(false);
  });

  it('captures haptics switch changes', () => {
    render(<VibesScreen />);
    fireEvent(screen.getByLabelText('Haptics toggle'), 'valueChange', false);
    expect(useSettingsStore.getState().hapticsEnabled).toBe(false);
    expect(mockCapture).toHaveBeenCalledWith('settings_vibes_changed', {
      which_setting: 'haptics',
      new_value: false,
    });
  });

  it('tapping sounds toggle flips soundsEnabled', () => {
    render(<VibesScreen />);
    fireEvent.press(screen.getByTestId('vibes-sounds'));
    expect(useSettingsStore.getState().soundsEnabled).toBe(true);
  });

  it('tapping animations toggle flips animationsEnabled', () => {
    render(<VibesScreen />);
    fireEvent.press(screen.getByTestId('vibes-animations'));
    expect(useSettingsStore.getState().animationsEnabled).toBe(false);
  });
});
