// Active deck for a P6 swipe session. Renders a two-card stack from the
// session's `deck_recipe_ids`, dispatches `submit_swipe` on each commit,
// broadcasts the commit to the partner channel, and ends the session
// when the deck is exhausted.
//
// Two commit surfaces share one path:
//   • Accessibility Like / Dislike buttons (also mandated by NFR-A4).
//   • Reanimated horizontal pan worklet on the top card — drag ≥ 40% of
//     screen width commits, otherwise snaps back. The worklet uses
//     runOnJS to call the SAME commit function the buttons call, so the
//     tests cover both routes by exercising the buttons only.
//
// The match overlay is wired in P6d; this component surfaces matches via
// `onMatch` so the parent screen can mount the overlay without coupling.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { useAnalytics } from '@/lib/analytics';
import {
  endSession,
  SessionRpcError,
  submitSwipe,
  type SubmitSwipeResult,
  type SwipeDirection,
} from '@/lib/session-rpcs';
import { isStreakActive } from '@/lib/streak';
import { createSupabaseClient } from '@/lib/supabase';
import { enqueueSwipe, peekSwipeQueue, removeFromSwipeQueue } from '@/lib/swipe-queue';
import { useDeck, type DeckRecipe } from '@/lib/use-deck';
import { useSwipeBroadcast } from '@/lib/use-swipe-broadcast';

// Errors WE retry. Everything else is a deterministic server rejection
// where a retry just makes noise.
const NON_RETRYABLE_CODES = new Set([
  'session_not_active',
  'session_not_found',
  'session_not_pending',
  'forbidden',
  'unauthenticated',
  'not_member',
]);

function isRetryable(err: unknown): boolean {
  if (err instanceof SessionRpcError) {
    return !NON_RETRYABLE_CODES.has(err.code);
  }
  // Raw network / fetch errors — retryable by default.
  return true;
}

const SWIPE_THRESHOLD_RATIO = 0.4;
const SCREEN_WIDTH = Dimensions.get('window').width;
const COMMIT_DISTANCE = SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO;
const EMPTY_RECIPE_ID_SET = new Set<string>();

export type OnMatchPayload = {
  matchId: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
};

export type OnLocalCommitPayload = { recipeId: string; direction: SwipeDirection };

export type SwipeDeckProps = {
  sessionId: string;
  recipeIds: string[];
  onMatch?: (payload: OnMatchPayload) => void;
  // MATCH-UX §8.2: fires after a successful submit_swipe so the parent
  // session screen can accumulate which recipeIds the local user has
  // swiped, for the partner-progress dot row.
  onLocalCommit?: (payload: OnLocalCommitPayload) => void;
  partnerRightCommittedRecipeIds?: ReadonlySet<string>;
};

type CommitArgs = { recipeId: string; direction: SwipeDirection };

export function SwipeDeck({
  sessionId,
  recipeIds,
  onMatch,
  onLocalCommit,
  partnerRightCommittedRecipeIds = EMPTY_RECIPE_ID_SET,
}: SwipeDeckProps) {
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const analytics = useAnalytics();

  const { data: deck, isLoading } = useDeck(recipeIds);
  const { broadcastCommit, broadcastProgress, broadcastMatch } = useSwipeBroadcast(sessionId);

  const [index, setIndex] = useState(0);
  const [localRightCommittedRecipeIds, setLocalRightCommittedRecipeIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [errorVisible, setErrorVisible] = useState(false);
  // MATCH-UX §8.1: 200ms green/red edge flash on commit. Plain React state
  // + setTimeout is sufficient — the card already carries borderWidth:2 with
  // transparent default so there's no layout shift when the color flips.
  const [flashDir, setFlashDir] = useState<SwipeDirection | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);
  const cardIndexRef = useRef(0);
  const lastSwipeAtRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // Reanimated shared values must live above the early returns to satisfy
  // the Rules of Hooks. They drive the gesture-card animation; buttons
  // ignore them entirely.
  const translateX = useSharedValue(0);

  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;
  const onLocalCommitRef = useRef(onLocalCommit);
  onLocalCommitRef.current = onLocalCommit;

  // deckByIdRef so the commit closure always has fresh metadata without
  // needing to recreate the mutation callback when the deck loads.
  const deckByIdRef = useRef<Map<string, DeckRecipe>>(new Map());
  useEffect(() => {
    deckByIdRef.current = new Map((deck ?? []).map((r) => [r.id, r]));
  }, [deck]);

  // Drain any swipes that the queue is holding from a previous failure.
  // Fire-and-forget: each item attempts submit_swipe; success removes it
  // from the queue, failure leaves it for the next drain pass. This runs
  // independently of the foreground commit mutation, so a slow drain
  // never blocks the user from swiping the next card.
  const drainQueue = useCallback(async () => {
    const items = peekSwipeQueue(sessionId);
    for (const item of items) {
      try {
        await submitSwipe(supabase, sessionId, item.recipeId, item.direction);
        removeFromSwipeQueue(sessionId, item);
        // Partner mirror for queued commits too — the partner missed the
        // original broadcast when we were offline.
        void broadcastCommit({ recipeId: item.recipeId, direction: item.direction });
      } catch (err) {
        if (!isRetryable(err)) {
          // Server says "no" deterministically — stop banging on it.
          removeFromSwipeQueue(sessionId, item);
          continue;
        }
        // Still offline / still transient. Leave it queued and break out
        // so we don't burn through the rest of the queue against a
        // network that's just going to reject everything.
        break;
      }
    }
  }, [supabase, sessionId, broadcastCommit]);

  const commitMutation = useMutation<SubmitSwipeResult, unknown, CommitArgs>({
    mutationFn: async ({ recipeId, direction }) => {
      const result = await submitSwipe(supabase, sessionId, recipeId, direction);
      // Broadcast irrespective of match — partner whisper fires either way.
      void broadcastCommit({ recipeId, direction });
      return result;
    },
    onSuccess: (result, vars) => {
      setErrorVisible(false);
      // Network is healthy — opportunistic drain.
      void drainQueue();
      // Fire BEFORE match handling so the parent's local-set update doesn't
      // race the overlay mount (which itself is just setState in the parent).
      onLocalCommitRef.current?.({ recipeId: vars.recipeId, direction: vars.direction });
      if (result.match && result.matchId) {
        const recipe = deckByIdRef.current.get(vars.recipeId);
        const payload: OnMatchPayload = {
          matchId: result.matchId,
          recipeId: vars.recipeId,
          recipeTitle: recipe?.title ?? '',
          recipeImageUrl: recipe?.imageUrl ?? null,
        };
        // Local UI hook for the host screen to mount the overlay.
        onMatchRef.current?.(payload);
        // Partner mirror — fire and forget. The partner's overlay opens
        // off match.created if their submit_swipe hasn't returned yet.
        void broadcastMatch(payload);
      }
      const now = Date.now();
      const timeSincePrevSwipeMs =
        lastSwipeAtRef.current === null ? 0 : now - lastSwipeAtRef.current;
      lastSwipeAtRef.current = now;
      analytics.capture('swipe', {
        session_id: sessionId,
        recipe_id: vars.recipeId,
        direction: vars.direction,
        card_index: cardIndexRef.current,
        time_since_prev_swipe_ms: timeSincePrevSwipeMs,
      });
      cardIndexRef.current += 1;
      setIndex((i) => i + 1);
    },
    onError: (err, vars) => {
      if (isRetryable(err)) {
        // NFR-R1: enqueue the failed swipe and surface a retry banner —
        // the next successful commit (or component mount) drains it.
        enqueueSwipe(sessionId, { recipeId: vars.recipeId, direction: vars.direction });
      }
      setErrorVisible(true);
      // Snap the card back so the user can retry — gesture branch.
      translateX.value = withSpring(0);
    },
  });

  // Mount-time drain: if the user came back to the screen after the queue
  // accumulated entries, kick a drain pass.
  useEffect(() => {
    void drainQueue();
  }, [drainQueue]);

  const commit = useCallback(
    ({ recipeId, direction }: CommitArgs) => {
      if (commitMutation.isPending) return;
      // MATCH-UX §8.1: card-edge flash, 200ms — fire before mutation so the
      // visual cue lands immediately and doesn't depend on the network.
      setFlashDir(direction);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashDir(null), 200);
      // MATCH-UX §5: light impact on right, selection on left. The
      // wrapper no-ops when settings.hapticsEnabled is false.
      if (direction === 'right') haptics.impactLight();
      else haptics.selection();
      if (direction === 'right') {
        setLocalRightCommittedRecipeIds((prev) => {
          if (prev.has(recipeId)) return prev;
          const next = new Set(prev);
          next.add(recipeId);
          return next;
        });
      }
      commitMutation.mutate({ recipeId, direction });
    },
    [commitMutation],
  );

  // Trigger end_session('completed') exactly once when the deck is exhausted.
  useEffect(() => {
    if (!deck || endedRef.current) return;
    if (recipeIds.length === 0) return;
    if (index < recipeIds.length) return;
    endedRef.current = true;
    void endSession(supabase, sessionId, 'completed').catch(() => {
      // Already-ended is fine — server is idempotent on end_session.
      // Other errors surface via the polling screen-level query.
    });
  }, [deck, index, recipeIds.length, sessionId, supabase]);

  // Gesture worklet → runOnJS into the same commit path the buttons use.
  const pan = useMemo(() => {
    const currentRecipe = deck?.[index];
    if (!currentRecipe) return Gesture.Pan();
    return Gesture.Pan()
      .onChange((evt) => {
        translateX.value = evt.translationX;
        const fraction = Math.min(1, Math.abs(evt.translationX) / COMMIT_DISTANCE);
        runOnJS(broadcastProgress)({ recipeId: currentRecipe.id, fraction });
      })
      .onEnd((evt) => {
        const dx = evt.translationX;
        if (Math.abs(dx) >= COMMIT_DISTANCE) {
          const direction: SwipeDirection = dx > 0 ? 'right' : 'left';
          translateX.value = withSpring(Math.sign(dx) * SCREEN_WIDTH);
          runOnJS(commit)({ recipeId: currentRecipe.id, direction });
        } else {
          translateX.value = withSpring(0);
        }
      });
    // Re-derive when the top card changes so the worklet captures the right id.
  }, [deck, index, broadcastProgress, commit, translateX]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotateZ: `${interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-15, 0, 15])}deg`,
      },
    ],
  }));

  if (isLoading) {
    return (
      <View testID="swipe-deck-loading" style={styles.center}>
        <ThemedText type="small">Loading recipes…</ThemedText>
      </View>
    );
  }

  const current = deck?.[index];
  const next = deck?.[index + 1];

  if (!deck || !current || index >= recipeIds.length) {
    return (
      <View testID="swipe-deck-empty" style={styles.center}>
        <ThemedText type="title">All done!</ThemedText>
        <ThemedText type="small">You both saw every card.</ThemedText>
      </View>
    );
  }

  const errorCode =
    commitMutation.error instanceof SessionRpcError ? commitMutation.error.code : 'unknown';
  const errorIsRetryable = isRetryable(commitMutation.error);
  const streakActive = isStreakActive(
    recipeIds,
    index,
    localRightCommittedRecipeIds,
    partnerRightCommittedRecipeIds,
  );

  return (
    <View style={styles.container} testID="swipe-deck">
      <View style={styles.stack}>
        {streakActive ? (
          <View
            testID="swipe-deck-streak"
            accessibilityLabel="On a streak"
            style={styles.streakPill}
          >
            <ThemedText type="small" style={styles.streakText}>
              🔥 streak
            </ThemedText>
          </View>
        ) : null}
        {next ? <CardBack recipe={next} /> : null}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.card,
              cardStyle,
              flashDir === 'right' && styles.cardFlashRight,
              flashDir === 'left' && styles.cardFlashLeft,
            ]}
            testID="swipe-deck-card-current"
          >
            <ThemedText type="subtitle">{current.title}</ThemedText>
          </Animated.View>
        </GestureDetector>
      </View>

      {errorVisible ? (
        <ThemedText type="small" testID="swipe-deck-error">
          {errorCode === 'session_not_active'
            ? 'Session is no longer active. Pull back to home.'
            : errorIsRetryable
              ? 'Saved — we’ll retry when you’re back online.'
              : 'Couldn’t record that swipe. Try again.'}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          testID="swipe-deck-dislike"
          accessibilityRole="button"
          accessibilityLabel="Dislike"
          style={[styles.actionBtn, styles.dislikeBtn]}
          disabled={commitMutation.isPending}
          onPress={() => commit({ recipeId: current.id, direction: 'left' })}
        >
          <ThemedText type="default" style={styles.actionText}>
            Pass
          </ThemedText>
        </Pressable>
        <Pressable
          testID="swipe-deck-like"
          accessibilityRole="button"
          accessibilityLabel="Like"
          style={[styles.actionBtn, styles.likeBtn]}
          disabled={commitMutation.isPending}
          onPress={() => commit({ recipeId: current.id, direction: 'right' })}
        >
          <ThemedText type="default" style={styles.actionText}>
            Like
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function CardBack({ recipe }: { recipe: DeckRecipe }) {
  return (
    <View style={[styles.card, styles.cardBehind]} testID="swipe-deck-card-next">
      <ThemedText type="subtitle">{recipe.title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  stack: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  streakPill: {
    position: 'absolute',
    top: Spacing.two,
    zIndex: 2,
    elevation: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: DesignTokens.radius.pill,
    backgroundColor: DesignTokens.color.canvas.light,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderMuted.light,
  },
  streakText: {
    color: DesignTokens.color.ink.light,
    fontWeight: '700',
  },
  card: {
    position: 'absolute',
    width: '90%',
    aspectRatio: 3 / 4,
    borderRadius: DesignTokens.radius.lg,
    // Card surface — always dark in v1 regardless of OS theme; use the
    // light-mode value of the themed token explicitly.
    backgroundColor: DesignTokens.color.swipeCardSurface.light,
    padding: Spacing.four,
    justifyContent: 'flex-end',
    // Reserve border space at all times so the flash doesn't shift layout.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardFlashRight: { borderColor: DesignTokens.color.accentSuccess },
  cardFlashLeft: { borderColor: DesignTokens.color.accentDanger },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.7 },
  actions: { flexDirection: 'row', gap: Spacing.three, justifyContent: 'center' },
  actionBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: DesignTokens.radius.md,
    minWidth: 120,
    alignItems: 'center',
  },
  likeBtn: { backgroundColor: DesignTokens.color.accentSuccess },
  dislikeBtn: { backgroundColor: DesignTokens.color.accentDanger },
  actionText: { color: DesignTokens.color.textOnDark, fontWeight: '700' },
});
