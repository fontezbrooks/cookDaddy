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

import * as Sentry from '@sentry/react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Confetti, CONFETTI_PARTICLE_COUNT } from '@/components/confetti';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { audio } from '@/lib/audio';
import { haptics } from '@/lib/haptics';
import {
  MATCH_VARIANT_CONFIG,
  type MatchVariant,
  type MatchVariantConfig,
} from '@/lib/match-variant';
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
  // MATCH-UX §7 variant — caller (session screen) determines which
  // variant the current match qualifies for via determineMatchVariant().
  // Defaults to 'standard' when omitted so existing call sites keep
  // working without change.
  variant?: MatchVariant;
};

export function MatchOverlay({
  payload,
  onClose,
  onPrimary,
  variant = 'standard',
}: MatchOverlayProps) {
  const config = MATCH_VARIANT_CONFIG[variant];
  const reducedMotion = useReducedMotion();
  const analytics = useAnalytics();

  // Analytics dismissal-reason — captured on whichever path closes the
  // overlay (auto-close timer / primary CTA / secondary CTA). Mutated
  // in handlers, read in the cleanup effect so we only fire once per
  // overlay lifecycle. Default 'auto' covers the timer path.
  const dismissalReasonRef = useRef<'auto' | 'primary' | 'secondary'>('auto');
  const mountedAtRef = useRef(Date.now());

  // MATCH-UX §11: overlay first frame ≤100ms from broadcast event.
  // Wrap the mount → first-paint window in a Sentry span so it shows
  // up in the perf dashboard. PostHog mirrors the variant + payload IDs
  // so we can correlate engagement against §13 metrics.
  useEffect(() => {
    const mountedAt = mountedAtRef.current;
    const span = Sentry.startInactiveSpan({
      name: 'match-overlay.mount',
      op: 'ui.render',
      attributes: { variant, matchId: payload.matchId, recipeId: payload.recipeId },
    });
    analytics.capture('match_revealed', {
      variant,
      match_id: payload.matchId,
      recipe_id: payload.recipeId,
    });
    return () => {
      span?.end();
      const action =
        dismissalReasonRef.current === 'primary'
          ? 'cook_this'
          : dismissalReasonRef.current === 'secondary'
            ? 'keep_swiping'
            : 'closed';
      analytics.capture('match_overlay_dismissed', {
        match_id: payload.matchId,
        duration_ms: Date.now() - mountedAt,
        action,
      });
    };
  }, [analytics, variant, payload.matchId, payload.recipeId]);

  // Auto-dismiss at the hard cap so a stuck overlay can't block the deck.
  useEffect(() => {
    const id = setTimeout(() => {
      dismissalReasonRef.current = 'auto';
      onClose();
    }, config.autoCloseMs ?? AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [config.autoCloseMs, onClose]);

  const handlePrimary = (p: MatchOverlayPayload) => {
    dismissalReasonRef.current = 'primary';
    onPrimary?.(p);
  };

  const handleSecondaryClose = () => {
    dismissalReasonRef.current = 'secondary';
    onClose();
  };

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
          <ReducedContent
            payload={payload}
            onClose={handleSecondaryClose}
            onPrimary={handlePrimary}
            config={config}
          />
        </View>
      </View>
    );
  }

  return (
    <FullMotionOverlay
      payload={payload}
      onClose={handleSecondaryClose}
      onPrimary={handlePrimary}
      a11yLabel={a11yLabel}
      config={config}
    />
  );
}

function FullMotionOverlay({
  payload,
  onClose,
  onPrimary,
  a11yLabel,
  config,
}: MatchOverlayProps & { a11yLabel: string; config: MatchVariantConfig }) {
  // MATCH-UX §3 frame timeline:
  //   t=0     backdrop fade-in begins (280ms)
  //   t=120   card scale-up via spring (cardScale)
  //   t=400   card flips along Y-axis 180°→0° (cardFlipMs = 350ms)
  //   t=750   confetti fires (gated by confettiVisible)
  //   t=1100  ken-burns idle begins on the recipe image (6s/8s cycles)
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);
  const cardOpacity = useSharedValue(0);
  // 180° = card is facing away (we see the back); 0° = facing the
  // viewer. We start flipped away so the t=400ms animation reveals the
  // "back face" content (which is the match overlay itself).
  const cardRotateY = useSharedValue(180);
  // Ken-burns: drives scale and translateX on the recipe image. Both
  // run withRepeat(-1, true) so they reverse instead of jumping.
  const kbScale = useSharedValue(1);
  const kbTranslateX = useSharedValue(0);
  // Confetti is gated behind a state toggle that flips at t=750ms per
  // MATCH-UX §3 (`revealFromCommitMs`). Mounting only at that moment
  // means React doesn't pay for 60 particles + 240 derived values during
  // the lead-in animation.
  const [confettiVisible, setConfettiVisible] = useState(false);

  useEffect(() => {
    const timings = DesignTokens.motion.timings;
    backdropOpacity.value = withTiming(0.7, { duration: timings.backdropMs });
    cardOpacity.value = withTiming(1, { duration: 120 });
    cardScale.value = withDelay(120, withSpring(1, DesignTokens.motion.springs.card));
    cardRotateY.value = withDelay(
      400,
      withTiming(0, {
        duration: timings.cardFlipMs,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
    );
    // Ken-burns kicks in at t=1100ms (350ms after reveal at t=750ms).
    // 6s / 8s cycles per §4.4 — keeps the still image alive while the
    // user reads.
    kbScale.value = withDelay(
      1100,
      withRepeat(
        withSequence(
          withTiming(1.05, { duration: 6000, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    kbTranslateX.value = withDelay(
      1100,
      withRepeat(
        withSequence(
          withTiming(4, { duration: 8000, easing: Easing.inOut(Easing.quad) }),
          withTiming(-4, { duration: 8000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    const confettiTimer = setTimeout(() => setConfettiVisible(true), timings.revealFromCommitMs);
    return () => clearTimeout(confettiTimer);
  }, [backdropOpacity, cardOpacity, cardScale, cardRotateY, kbScale, kbTranslateX]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [
      // Perspective MUST come before rotateY so the rotation has depth.
      { perspective: 1200 },
      { scale: cardScale.value },
      { rotateY: `${cardRotateY.value}deg` },
    ],
  }));
  const kenBurnsStyle = useAnimatedStyle(() => ({
    transform: [{ scale: kbScale.value }, { translateX: kbTranslateX.value }],
  }));

  const content = useMemo(
    () => <FullContent payload={payload} onClose={onClose} onPrimary={onPrimary} config={config} />,
    [payload, onClose, onPrimary, config],
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
        {payload.recipeImageUrl ? (
          <View style={styles.heroFrame}>
            <Animated.Image
              testID="match-overlay-hero"
              source={{ uri: payload.recipeImageUrl }}
              style={[styles.hero, kenBurnsStyle]}
              resizeMode="cover"
            />
          </View>
        ) : null}
        {content}
      </Animated.View>
      {confettiVisible ? (
        <View style={styles.confettiLayer} pointerEvents="none">
          <Confetti
            originX={screenWidth / 2}
            originY={screenHeight / 2}
            width={screenWidth}
            height={screenHeight}
            particleCount={Math.round(CONFETTI_PARTICLE_COUNT * config.confettiDensity)}
          />
        </View>
      ) : null}
    </View>
  );
}

function FullContent({
  payload,
  onClose,
  onPrimary,
  config,
}: MatchOverlayProps & { config: MatchVariantConfig }) {
  return (
    <>
      <ThemedText type="title" style={styles.heading} testID="match-overlay-heading">
        {config.heading}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.recipeTitle}>
        {payload.recipeTitle}
      </ThemedText>
      {config.badge ? (
        <ThemedText type="small" style={styles.badge} testID="match-overlay-badge">
          {config.badge}
        </ThemedText>
      ) : null}
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

function ReducedContent(props: MatchOverlayProps & { config: MatchVariantConfig }) {
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
  // Recipe hero clipped to a fixed-aspect frame so the ken-burns
  // scale + translate (1.0 → 1.05, ±4px) doesn't leak past the card edge.
  heroFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: DesignTokens.radius.md,
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  heading: { textAlign: 'center' },
  recipeTitle: { textAlign: 'center' },
  // Variant badge — small accent text beneath the recipe title (MATCH-UX
  // §7 row "Same wavelength 🧠" for speedy, future variants too).
  badge: {
    textAlign: 'center',
    color: DesignTokens.color.accentCelebration2,
    fontWeight: '600',
  },
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
