import { renderHook } from '@testing-library/react-native';

import { useDeckSizeFlag } from '@/lib/use-deck-size-flag';

let mockFeatureFlagValue: unknown;

jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({
    getFeatureFlag: () => mockFeatureFlagValue,
  }),
}));

describe('useDeckSizeFlag', () => {
  beforeEach(() => {
    mockFeatureFlagValue = undefined;
  });

  it.each([
    ['15', 15],
    [20, 20],
    [true, undefined],
    [undefined, undefined],
    ['abc', undefined],
    ['0', undefined],
  ] as const)('coerces %p to %p', (value, expected) => {
    mockFeatureFlagValue = value;

    const { result } = renderHook(() => useDeckSizeFlag());

    expect(result.current).toBe(expected);
  });
});
