import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import {
  getPushPermissionStatus,
  registerPushToken,
  requestPushPermission,
  type PushPermissionStatus,
} from '@/lib/push-registration';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';
import { usePushPrimingStore } from '@/state/usePushPrimingStore';

const REPROMPT_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function PushPrimingSheet(): React.ReactElement | null {
  const { isSignedIn, userId, getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const analytics = useAnalytics();
  const hasPod = usePodStore((s) => Boolean(s.activePodId));
  const partnerName = usePodStore((s) => s.partnerDisplayName) ?? 'your partner';
  const promptedAt = usePushPrimingStore((s) => s.promptedAt);
  const setPromptedAt = usePushPrimingStore((s) => s.setPromptedAt);

  const [status, setStatus] = useState<PushPermissionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !hasPod) return undefined;
    let cancelled = false;
    void getPushPermissionStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, hasPod]);

  const eligibleByTime = promptedAt === null || Date.now() - promptedAt > REPROMPT_AFTER_MS;
  const visible =
    Boolean(isSignedIn) && hasPod && status === 'undetermined' && eligibleByTime && !dismissed;
  const trigger = promptedAt === null ? 'first_pod_created' : 'reprompt';

  useEffect(() => {
    if (visible) analytics.capture('push_permission_prompted', { trigger });
    // fire once when the sheet becomes visible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const onContinue = async () => {
    const granted = await requestPushPermission();
    setPromptedAt(Date.now());
    if (granted && userId) {
      await registerPushToken(supabase, userId).catch(() => undefined);
      analytics.capture('push_permission_granted', { platform: Platform.OS as 'ios' | 'android' });
    }
    setDismissed(true);
  };

  const onSkip = () => {
    setPromptedAt(Date.now());
    setDismissed(true);
  };

  return (
    <View style={styles.backdrop} testID="push-priming-sheet">
      <View style={styles.card}>
        <ThemedText type="subtitle">Stay in the loop</ThemedText>
        <ThemedText type="small">
          Get notified when {partnerName} wants to swipe - and the moment you both match.
        </ThemedText>
        <View style={styles.actions}>
          <Pressable
            testID="push-priming-continue"
            style={styles.cta}
            onPress={() => void onContinue()}
          >
            <ThemedText type="small" style={styles.ctaText}>
              Turn on notifications
            </ThemedText>
          </Pressable>
          <Pressable testID="push-priming-skip" style={styles.skip} onPress={onSkip}>
            <ThemedText type="small">Not now</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  card: {
    backgroundColor: DesignTokens.color.surface.light,
    padding: Spacing.four,
    gap: Spacing.three,
    borderTopLeftRadius: DesignTokens.radius.lg,
    borderTopRightRadius: DesignTokens.radius.lg,
  },
  actions: { gap: Spacing.two, paddingTop: Spacing.two },
  cta: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.accentSuccess,
  },
  ctaText: { color: DesignTokens.color.textOnDark, fontWeight: '600' },
  skip: { alignItems: 'center', paddingVertical: Spacing.two },
});
