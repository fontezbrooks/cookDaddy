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
import { Spacing } from '@/constants/theme';
import {
  endSession,
  SessionRpcError,
  submitSwipe,
  type SubmitSwipeResult,
  type SwipeDirection,
} from '@/lib/session-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { useDeck, type DeckRecipe } from '@/lib/use-deck';
import { useSwipeBroadcast } from '@/lib/use-swipe-broadcast';

const SWIPE_THRESHOLD_RATIO = 0.4;
const SCREEN_WIDTH = Dimensions.get('window').width;
const COMMIT_DISTANCE = SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO;

export type OnMatchPayload = {
  matchId: string;
  recipeId: string;
};

export type SwipeDeckProps = {
  sessionId: string;
  recipeIds: string[];
  onMatch?: (payload: OnMatchPayload) => void;
};

type CommitArgs = { recipeId: string; direction: SwipeDirection };

export function SwipeDeck({ sessionId, recipeIds, onMatch }: SwipeDeckProps) {
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const { data: deck, isLoading } = useDeck(recipeIds);
  const { broadcastCommit, broadcastProgress } = useSwipeBroadcast(sessionId);

  const [index, setIndex] = useState(0);
  const [errorVisible, setErrorVisible] = useState(false);
  const endedRef = useRef(false);

  // Reanimated shared values must live above the early returns to satisfy
  // the Rules of Hooks. They drive the gesture-card animation; buttons
  // ignore them entirely.
  const translateX = useSharedValue(0);

  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  const commitMutation = useMutation<SubmitSwipeResult, unknown, CommitArgs>({
    mutationFn: async ({ recipeId, direction }) => {
      const result = await submitSwipe(supabase, sessionId, recipeId, direction);
      // Broadcast irrespective of match — partner whisper fires either way.
      void broadcastCommit({ recipeId, direction });
      return result;
    },
    onSuccess: (result, vars) => {
      setErrorVisible(false);
      if (result.match && result.matchId && onMatchRef.current) {
        onMatchRef.current({ matchId: result.matchId, recipeId: vars.recipeId });
      }
      setIndex((i) => i + 1);
    },
    onError: () => {
      setErrorVisible(true);
      // Snap the card back so the user can retry — gesture branch.
      translateX.value = withSpring(0);
    },
  });

  const commit = useCallback(
    ({ recipeId, direction }: CommitArgs) => {
      if (commitMutation.isPending) return;
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

  return (
    <View style={styles.container} testID="swipe-deck">
      <View style={styles.stack}>
        {next ? <CardBack recipe={next} /> : null}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, cardStyle]} testID="swipe-deck-card-current">
            <ThemedText type="subtitle">{current.title}</ThemedText>
          </Animated.View>
        </GestureDetector>
      </View>

      {errorVisible ? (
        <ThemedText type="small" testID="swipe-deck-error">
          {errorCode === 'session_not_active'
            ? 'Session is no longer active. Pull back to home.'
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
  card: {
    position: 'absolute',
    width: '90%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: '#111',
    padding: Spacing.four,
    justifyContent: 'flex-end',
  },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.7 },
  actions: { flexDirection: 'row', gap: Spacing.three, justifyContent: 'center' },
  actionBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  likeBtn: { backgroundColor: '#16a34a' },
  dislikeBtn: { backgroundColor: '#7a1f1f' },
  actionText: { color: '#fff', fontWeight: '700' },
});
