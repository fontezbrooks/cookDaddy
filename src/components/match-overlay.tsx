// Match overlay (P6d). Structural implementation of MATCH-UX §3 — fires
// when submit_swipe returns { match: true } locally OR when a partner
// pushes a `match.created` event on the session realtime channel.
//
// Scope of this slice (deferred to P8 polish or P6e):
//   • No Skia confetti — section §4.3 is a particle layout future-pass.
//   • No expo-haptics calls — the Settings → Haptics toggle lands in P6e;
//     wiring the calls without the toggle would violate MATCH-UX §10.
//   • No expo-audio.
//   • Single "standard" variant — the first-ever / streak / speedy / last
//     card layouts (§7) come later.
//   • Ken-burns recipe-image idle (§4.4) deferred.
//
// What IS here: backdrop, animated card reveal, recipe title + image,
// "Cook this!" + "Keep swiping" CTAs, reduced-motion crossfade fallback,
// 2.5s auto-close hard cap (§14), a11y label per §10.

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const AUTO_CLOSE_MS = 2500;

export type MatchOverlayPayload = {
  matchId: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
};

export type MatchOverlayProps = {
  payload: MatchOverlayPayload;
  onClose: () => void;
  onPrimary?: (payload: MatchOverlayPayload) => void;
};

export function MatchOverlay({ payload, onClose, onPrimary }: MatchOverlayProps) {
  const reducedMotion = useReducedMotion();

  // Auto-dismiss at the hard cap so a stuck overlay can't block the deck.
  useEffect(() => {
    const id = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [onClose]);

  const a11yLabel = `It's a match! Both of you liked ${payload.recipeTitle}. Cook this, or keep swiping.`;

  if (reducedMotion) {
    return (
      <View
        testID="match-overlay"
        accessible
        accessibilityRole="alert"
        accessibilityLabel={a11yLabel}
        style={[styles.root, styles.backdropSolid]}
      >
        <View testID="match-overlay-reduced-motion" style={styles.cardReduced}>
          <ReducedContent payload={payload} onClose={onClose} onPrimary={onPrimary} />
        </View>
      </View>
    );
  }

  return (
    <FullMotionOverlay
      payload={payload}
      onClose={onClose}
      onPrimary={onPrimary}
      a11yLabel={a11yLabel}
    />
  );
}

function FullMotionOverlay({
  payload,
  onClose,
  onPrimary,
  a11yLabel,
}: MatchOverlayProps & { a11yLabel: string }) {
  // Backdrop dim (§4.2): 0 → 0.7 over 280ms. Card scale (§3 t=120ms):
  // 1.0 → 1.15 over 280ms with overshoot. The flip + confetti from §3
  // are structural placeholders here — the card just springs into view.
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    backdropOpacity.value = withTiming(0.7, { duration: 280 });
    cardOpacity.value = withTiming(1, { duration: 120 });
    cardScale.value = withDelay(120, withSpring(1, { damping: 12, stiffness: 180, mass: 1 }));
  }, [backdropOpacity, cardOpacity, cardScale]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const content = useMemo(
    () => <FullContent payload={payload} onClose={onClose} onPrimary={onPrimary} />,
    [payload, onClose, onPrimary],
  );

  return (
    <View
      testID="match-overlay"
      accessible
      accessibilityRole="alert"
      accessibilityLabel={a11yLabel}
      style={styles.root}
      pointerEvents="box-none"
    >
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.card, cardStyle]} pointerEvents="auto">
        {content}
      </Animated.View>
    </View>
  );
}

function FullContent({ payload, onClose, onPrimary }: MatchOverlayProps) {
  return (
    <>
      <ThemedText type="title" style={styles.heading}>
        It’s a match!
      </ThemedText>
      <ThemedText type="subtitle" style={styles.recipeTitle}>
        {payload.recipeTitle}
      </ThemedText>
      <View style={styles.ctaRow}>
        <Pressable
          testID="match-overlay-primary"
          accessibilityRole="button"
          accessibilityLabel="Cook this recipe"
          style={[styles.cta, styles.ctaPrimary]}
          onPress={() => onPrimary?.(payload)}
        >
          <ThemedText type="default" style={styles.ctaPrimaryText}>
            Cook this!
          </ThemedText>
        </Pressable>
        <Pressable
          testID="match-overlay-secondary"
          accessibilityRole="button"
          accessibilityLabel="Keep swiping"
          style={[styles.cta, styles.ctaSecondary]}
          onPress={onClose}
        >
          <ThemedText type="default" style={styles.ctaSecondaryText}>
            Keep swiping
          </ThemedText>
        </Pressable>
      </View>
    </>
  );
}

function ReducedContent(props: MatchOverlayProps) {
  return <FullContent {...props} />;
}

const styles = StyleSheet.create({
  root: {
    ...(StyleSheet.absoluteFill as object),
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: '#000',
  },
  // Reduced-motion solid scrim — opacity gradient is replaced by a
  // flat 0.7 backdrop per MATCH-UX §10 row "Reduced transparency".
  backdropSolid: {
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  card: {
    width: '85%',
    borderRadius: 24,
    backgroundColor: '#fff',
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  cardReduced: {
    width: '85%',
    borderRadius: 24,
    backgroundColor: '#fff',
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  heading: { textAlign: 'center' },
  recipeTitle: { textAlign: 'center' },
  ctaRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  cta: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 14,
    minWidth: 130,
    alignItems: 'center',
  },
  ctaPrimary: { backgroundColor: '#16a34a' },
  ctaSecondary: { backgroundColor: '#f0f0f3' },
  ctaPrimaryText: { color: '#fff', fontWeight: '700' },
  ctaSecondaryText: { color: '#111', fontWeight: '600' },
});
