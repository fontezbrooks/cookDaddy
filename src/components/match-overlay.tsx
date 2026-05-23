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

import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Confetti } from '@/components/confetti';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { audio } from '@/lib/audio';
import { haptics } from '@/lib/haptics';
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

  // MATCH-UX §5 haptic pattern: light at t=0 (mount + heartbeat), light
  // again at t=280ms, heavy at t=750ms (reveal). Reduced-motion skips the
  // entire pattern — the spec ties haptics to the motion sequence and §10
  // collapses motion to a static crossfade, so haptics fall away with it.
  // §6 audio pairs to the reveal beat at t=750ms; audio's own no-op
  // happens inside audio.playMatchReveal() if soundsEnabled is false
  // (default OFF per §6) or no asset is bound.
  useEffect(() => {
    if (reducedMotion) return;
    haptics.impactLight();
    const t280 = setTimeout(() => haptics.impactLight(), 280);
    const t750 = setTimeout(() => {
      haptics.impactHeavy();
      audio.playMatchReveal();
    }, DesignTokens.motion.timings.revealFromCommitMs);
    return () => {
      clearTimeout(t280);
      clearTimeout(t750);
    };
  }, [reducedMotion]);

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
  // 1.0 → 1.15 over 280ms with overshoot.
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);
  const cardOpacity = useSharedValue(0);
  // Confetti is gated behind a state toggle that flips at t=750ms per
  // MATCH-UX §3 (`revealFromCommitMs`). Mounting only at that moment
  // means React doesn't pay for 60 particles + 240 derived values during
  // the lead-in animation.
  const [confettiVisible, setConfettiVisible] = useState(false);

  useEffect(() => {
    backdropOpacity.value = withTiming(0.7, { duration: DesignTokens.motion.timings.backdropMs });
    cardOpacity.value = withTiming(1, { duration: 120 });
    cardScale.value = withDelay(120, withSpring(1, DesignTokens.motion.springs.card));
    const confettiTimer = setTimeout(
      () => setConfettiVisible(true),
      DesignTokens.motion.timings.revealFromCommitMs,
    );
    return () => clearTimeout(confettiTimer);
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

  // Confetti fills the screen; spawn origin is screen-center which is
  // close enough to the card center for v0. Tightening the origin to the
  // card's runtime layout is a Slice 5 motion-polish refinement.
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
      {confettiVisible ? (
        <View style={styles.confettiLayer} pointerEvents="none">
          <Confetti
            originX={screenWidth / 2}
            originY={screenHeight / 2}
            width={screenWidth}
            height={screenHeight}
          />
        </View>
      ) : null}
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
  // Confetti layer sits above the card so particles can spill over the
  // edges. pointerEvents:none on the parent View keeps the CTAs tappable.
  confettiLayer: {
    ...(StyleSheet.absoluteFill as object),
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as object),
    // Pure-black backdrop whose opacity is animated 0 → 0.7 separately
    // (MATCH-UX §4.2). textOnLight is reused for the literal '#000000';
    // bgOverlayScrim is the pre-alpha'd variant used by the reduced-motion
    // path below where the opacity isn't animated.
    backgroundColor: DesignTokens.color.textOnLight,
  },
  // Reduced-motion solid scrim — opacity gradient is replaced by a
  // flat 0.7 backdrop per MATCH-UX §10 row "Reduced transparency".
  backdropSolid: {
    backgroundColor: DesignTokens.color.bgOverlayScrim,
  },
  card: {
    width: '85%',
    borderRadius: 24,
    backgroundColor: DesignTokens.color.textOnDark,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  cardReduced: {
    width: '85%',
    borderRadius: 24,
    backgroundColor: DesignTokens.color.textOnDark,
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
  ctaPrimary: { backgroundColor: DesignTokens.color.accentSuccess },
  // The overlay renders against a black scrim — light-theme elevated
  // surface is the secondary CTA background regardless of OS theme.
  ctaSecondary: { backgroundColor: DesignTokens.color.bgElevated.light },
  ctaPrimaryText: { color: DesignTokens.color.textOnDark, fontWeight: '700' },
  ctaSecondaryText: { color: DesignTokens.color.bgCard.light, fontWeight: '600' },
});
