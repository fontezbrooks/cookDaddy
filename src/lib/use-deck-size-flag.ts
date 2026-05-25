import * as PostHogReactNative from 'posthog-react-native';

type FeatureFlagModule = typeof PostHogReactNative & {
  useFeatureFlag?: (key: string) => unknown;
};

type PostHogWithFeatureFlag = {
  getFeatureFlag?: (key: string) => unknown;
};

function coerceDeckSize(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed >= 1 ? parsed : undefined;
  }
  return undefined;
}

export function useDeckSizeFlag(): number | undefined {
  const posthog = PostHogReactNative.usePostHog() as PostHogWithFeatureFlag | undefined;
  const featureFlagHook = (PostHogReactNative as FeatureFlagModule).useFeatureFlag;
  const value =
    typeof featureFlagHook === 'function'
      ? featureFlagHook('deck_size')
      : posthog?.getFeatureFlag?.('deck_size');

  return coerceDeckSize(value);
}
