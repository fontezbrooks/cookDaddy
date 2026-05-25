// Analytics wrapper for DESIGN §17.1 event taxonomy and §17.3 privacy rules.

import { usePostHog } from 'posthog-react-native';
import { useCallback, useMemo } from 'react';

import { useSettingsStore } from '@/state/useSettingsStore';

type Platform = 'ios' | 'android';

export type AnalyticsEventProperties = {
  app_opened: { platform: Platform; app_version: string; cold_start: boolean; locale: string };
  signed_in: { provider: 'apple' | 'google' | 'email' };
  push_permission_prompted: { trigger: 'first_pod_created' | 'reprompt' };
  push_permission_granted: { platform: Platform };
  session_ready_state: { session_id: string; both_ready_within_ms: number };
  swipe: {
    session_id: string;
    recipe_id: string;
    direction: 'left' | 'right';
    card_index: number;
    time_since_prev_swipe_ms: number;
  };
  swipe_progress_seen: { session_id: string; partner_offset: number };
  match_revealed: {
    match_id: string;
    recipe_id: string;
    variant: string;
    pod_id?: string;
    session_id?: string;
    time_to_reveal_ms?: number;
  };
  match_overlay_dismissed: {
    match_id: string;
    duration_ms: number;
    action: 'cook_this' | 'keep_swiping' | 'closed';
  };
  match_first_ever: { pod_id: string; time_since_pod_created_min: number };
  recipe_cooked_marked: { match_id: string; recipe_id: string; time_since_match_h: number };
  recipe_rated: { match_id: string; recipe_id: string; stars: number };
  shopping_item_added: { source: 'recipe' | 'manual'; pantry_conflict: boolean };
  pantry_item_added: { source: 'manual' | 'shopping_move' };
  settings_vibes_changed: { which_setting: string; new_value: boolean };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;

export type IdentifyProperties = {
  display_name?: string;
  created_at?: string;
  platform?: Platform;
  pod_id?: string | null;
};

export type PodGroupProperties = { created_at?: string; member_count?: number };

export function useAnalytics(): {
  capture: <E extends AnalyticsEventName>(event: E, props: AnalyticsEventProperties[E]) => void;
  identify: (distinctId: string, props: IdentifyProperties) => void;
  group: (groupType: 'pod', groupKey: string, props?: PodGroupProperties) => void;
  reset: () => void;
} {
  const posthog = usePostHog();
  const enabled = useSettingsStore((s) => s.analyticsEnabled);

  const capture = useCallback(
    <E extends AnalyticsEventName>(event: E, props: AnalyticsEventProperties[E]) => {
      if (!enabled) return;
      posthog?.capture(event, props);
    },
    [enabled, posthog],
  );

  const identify = useCallback(
    (distinctId: string, props: IdentifyProperties) => {
      if (!enabled) return;
      posthog?.identify(distinctId, props);
    },
    [enabled, posthog],
  );

  const group = useCallback(
    (groupType: 'pod', groupKey: string, props?: PodGroupProperties) => {
      if (!enabled) return;
      posthog?.group(groupType, groupKey, props);
    },
    [enabled, posthog],
  );

  const reset = useCallback(() => {
    // Sign-out must clear PostHog's local identity even when analytics is disabled.
    posthog?.reset();
  }, [posthog]);

  return useMemo(() => ({ capture, identify, group, reset }), [capture, identify, group, reset]);
}
