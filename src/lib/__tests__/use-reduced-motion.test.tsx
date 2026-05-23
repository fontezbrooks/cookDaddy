/**
 * Reduced-motion hook (P6d). Backs onto React Native's AccessibilityInfo:
 *
 *   • initial value from isReduceMotionEnabled()
 *   • live updates via the 'reduceMotionChanged' subscription
 *   • subscription is cleaned up on unmount
 *
 * MatchOverlay reads this to swap its spring/scale/flip sequence for a
 * 250ms crossfade per MATCH-UX §10. The toggle is OS-level today; a
 * Settings → Animations toggle (P6e) can override this hook in the future
 * by wrapping it.
 */

import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { useReducedMotion } from '@/lib/use-reduced-motion';

type Listener = (enabled: boolean) => void;

function Harness() {
  const reduced = useReducedMotion();
  return <Text testID="reduced">{reduced ? 'on' : 'off'}</Text>;
}

describe('useReducedMotion', () => {
  let listener: Listener | undefined;
  let removeSpy: jest.Mock;

  beforeEach(() => {
    listener = undefined;
    removeSpy = jest.fn();
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(() => Promise.resolve(false));
    (jest.spyOn(AccessibilityInfo, 'addEventListener') as jest.SpyInstance).mockImplementation(
      (event: string, cb: Listener) => {
        if (event === 'reduceMotionChanged') listener = cb;
        return { remove: removeSpy } as never;
      },
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to false then flips to true when the OS reports reduce-motion enabled', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(() => Promise.resolve(true));

    const view = render(<Harness />);
    expect(view.getByTestId('reduced')).toHaveTextContent('off');
    await act(async () => {
      // Let the initial isReduceMotionEnabled() promise resolve.
      await Promise.resolve();
    });
    expect(view.getByTestId('reduced')).toHaveTextContent('on');
  });

  it('updates when the OS toggle changes mid-session', async () => {
    const view = render(<Harness />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.getByTestId('reduced')).toHaveTextContent('off');

    act(() => {
      listener?.(true);
    });
    expect(view.getByTestId('reduced')).toHaveTextContent('on');

    act(() => {
      listener?.(false);
    });
    expect(view.getByTestId('reduced')).toHaveTextContent('off');
  });

  it('removes the subscription on unmount', () => {
    const view = render(<Harness />);
    view.unmount();
    expect(removeSpy).toHaveBeenCalled();
  });
});
