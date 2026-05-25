import { act, renderHook } from '@testing-library/react-native';

import { useAnalytics } from '@/lib/analytics';
import { __resetSettingsStoreForTests, useSettingsStore } from '@/state/useSettingsStore';

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockGroup = jest.fn();
const mockReset = jest.fn();

jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({
    capture: mockCapture,
    identify: mockIdentify,
    group: mockGroup,
    reset: mockReset,
  }),
  __mockPostHogSpies: {
    capture: mockCapture,
    identify: mockIdentify,
    group: mockGroup,
    reset: mockReset,
  },
}));

const swipeProps = {
  session_id: 's1',
  recipe_id: 'r1',
  direction: 'right',
  card_index: 3,
  time_since_prev_swipe_ms: 1200,
} as const;

describe('useAnalytics', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await __resetSettingsStoreForTests();
  });

  it('captures events when analytics is enabled by default', () => {
    const { result } = renderHook(() => useAnalytics());

    result.current.capture('swipe', swipeProps);

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith('swipe', swipeProps);
  });

  it('keeps swipe event properties to the no-PII §17.1 shape', () => {
    const { result } = renderHook(() => useAnalytics());

    result.current.capture('swipe', swipeProps);

    const received = mockCapture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(received).sort()).toEqual(
      ['card_index', 'direction', 'recipe_id', 'session_id', 'time_since_prev_swipe_ms'].sort(),
    );
    expect(received).not.toHaveProperty('display_name');
    expect(received).not.toHaveProperty('name');
    expect(received).not.toHaveProperty('email');
  });

  it('drops capture, identify, and group calls when opted out', () => {
    const { result, rerender } = renderHook(() => useAnalytics());
    act(() => {
      useSettingsStore.getState().setAnalyticsEnabled(false);
    });
    rerender({});

    result.current.capture('swipe', swipeProps);
    result.current.identify('u1', { display_name: 'Alex', platform: 'ios' });
    result.current.group('pod', 'pod-1', { member_count: 2 });

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockGroup).not.toHaveBeenCalled();
  });

  it('lets reset bypass the consent gate', () => {
    const { result, rerender } = renderHook(() => useAnalytics());
    act(() => {
      useSettingsStore.getState().setAnalyticsEnabled(false);
    });
    rerender({});

    result.current.reset();

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('forwards display_name as an identify user property when enabled', () => {
    const { result } = renderHook(() => useAnalytics());

    result.current.identify('u1', { display_name: 'Alex', platform: 'ios' });

    expect(mockIdentify).toHaveBeenCalledWith('u1', { display_name: 'Alex', platform: 'ios' });
  });
});
