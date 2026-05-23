// Live-sync swipe session screen. Renders one of three states based on
// sessions.status:
//   • lobby  → "Start swiping" button calls mark_session_active.
//   • active → SwipeDeck + MatchOverlay host. The overlay mounts on
//              either the local SwipeDeck onMatch callback (this user's
//              submit_swipe returned match=true) OR a partner broadcast
//              of match.created — whichever fires first wins.
//   • ended  → summary placeholder (cookbook surface lands in P9).
//
// v0 transitions to active on a single tap from either partner. The
// presence-driven "both must be ready" UX is a P6b.2 enhancement; the
// server already accepts either client calling mark_session_active because
// the RPC is idempotent.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchOverlay, type MatchOverlayPayload } from '@/components/match-overlay';
import { SessionSummary } from '@/components/session-summary';
import { SwipeDeck, type OnLocalCommitPayload, type OnMatchPayload } from '@/components/swipe-deck';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { determineMatchVariant, type MatchVariant } from '@/lib/match-variant';
import { markSessionActive, SessionRpcError } from '@/lib/session-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodMatchCount } from '@/lib/use-pod-matches';
import { useSwipeBroadcast } from '@/lib/use-swipe-broadcast';

type SessionRow = {
  id: string;
  status: 'lobby' | 'active' | 'ended';
  pod_id: string;
  deck_recipe_ids: string[];
  ended_reason: string | null;
};

export default function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  // Hosted at the screen so the overlay survives card-stack re-renders and
  // can be fed by either the local SwipeDeck or the partner broadcast.
  const [matchPayload, setMatchPayload] = useState<MatchOverlayPayload | null>(null);
  // MATCH-UX §7 variant computed at the moment the overlay mounts; held in
  // state so re-renders of the screen don't re-derive against stale inputs.
  const [matchVariant, setMatchVariant] = useState<MatchVariant>('standard');
  const podMatchCount = usePodMatchCount();
  const podHadPriorMatchesRef = useRef<boolean | undefined>(undefined);
  const { partnerCommit, partnerMatch, partnerCommittedRecipeIds, partnerRightCommittedRecipeIds } =
    useSwipeBroadcast(sessionId ?? '');

  // MATCH-UX §8.2: track which recipeIds the local user has swiped so the
  // dot row can render (full | half | empty) per card. Lives at this screen
  // because the partner's set lives in the broadcast hook; both must be
  // adjacent to compute the per-dot state.
  const [localCommittedRecipeIds, setLocalCommittedRecipeIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // MATCH-UX §7 variant detection inputs. Tracked here so determineMatchVariant
  // can be called synchronously inside the match handlers.
  const [matchesInSession, setMatchesInSession] = useState(0);
  const [lastLocalCommitAt, setLastLocalCommitAt] = useState<number | null>(null);
  const [lastPartnerCommitAt, setLastPartnerCommitAt] = useState<number | null>(null);

  useEffect(() => {
    if (podHadPriorMatchesRef.current !== undefined) return;
    if (podMatchCount.isLoading || podMatchCount.count == null) return;
    podHadPriorMatchesRef.current = podMatchCount.count > 0;
  }, [podMatchCount.count, podMatchCount.isLoading]);

  useEffect(() => {
    if (partnerCommit) setLastPartnerCommitAt(Date.now());
  }, [partnerCommit]);

  // Variant context refs so the synchronous match handlers see the latest
  // values without resubscribing on every state update.
  const variantInputsRef = useRef({
    matchesInSession: 0,
    lastLocalCommitAt: null as number | null,
    lastPartnerCommitAt: null as number | null,
    deckSize: 0,
    localCommittedRecipeIds: new Set<string>(),
    podHasPriorMatches: false,
  });
  variantInputsRef.current.matchesInSession = matchesInSession;
  variantInputsRef.current.lastLocalCommitAt = lastLocalCommitAt;
  variantInputsRef.current.lastPartnerCommitAt = lastPartnerCommitAt;
  variantInputsRef.current.localCommittedRecipeIds = localCommittedRecipeIds;
  variantInputsRef.current.podHasPriorMatches = podHadPriorMatchesRef.current ?? true;

  function computeVariantForMatch(recipeId: string): MatchVariant {
    const inputs = variantInputsRef.current;
    // cardIndex inferred from how many recipes the local user has
    // swiped — the match recipe was the most recent so its 0-based
    // index is (committedCount - 1). If the recipe isn't in the set
    // yet (partner-only match path), fall back to deckSize so the
    // lastCard branch isn't accidentally triggered.
    const committedCount = inputs.localCommittedRecipeIds.has(recipeId)
      ? inputs.localCommittedRecipeIds.size
      : inputs.localCommittedRecipeIds.size + 1;
    return determineMatchVariant({
      matchesInSessionBeforeThis: inputs.matchesInSession,
      cardIndex: committedCount - 1,
      deckSize: inputs.deckSize,
      lastLocalCommitAt: inputs.lastLocalCommitAt,
      lastPartnerCommitAt: inputs.lastPartnerCommitAt,
      podHasPriorMatches: inputs.podHasPriorMatches,
    });
  }

  useEffect(() => {
    if (partnerMatch && !matchPayload) {
      setMatchVariant(computeVariantForMatch(partnerMatch.recipeId));
      setMatchPayload(partnerMatch);
      setMatchesInSession((n) => n + 1);
    }
    // computeVariantForMatch reads through a ref, so it's stable.
  }, [partnerMatch, matchPayload]);

  const handleLocalMatch = (payload: OnMatchPayload) => {
    if (matchPayload) return;
    setMatchVariant(computeVariantForMatch(payload.recipeId));
    setMatchPayload(payload);
    setMatchesInSession((n) => n + 1);
  };

  const handleLocalCommit = (payload: OnLocalCommitPayload) => {
    setLastLocalCommitAt(Date.now());
    setLocalCommittedRecipeIds((prev) => {
      if (prev.has(payload.recipeId)) return prev;
      const next = new Set(prev);
      next.add(payload.recipeId);
      return next;
    });
  };

  const query = useQuery({
    queryKey: ['sessions', sessionId],
    enabled: Boolean(sessionId),
    refetchInterval: 2000, // partner can flip to active any time — poll cheaply
    queryFn: async (): Promise<SessionRow | null> => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, status, pod_id, deck_recipe_ids, ended_reason')
        .eq('id', sessionId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as SessionRow | null;
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => markSessionActive(supabase, sessionId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', sessionId] });
    },
  });

  // Keep deckSize in the variant ref synced from the loaded session row.
  // Lives outside `query.data` access so the ref's deckSize is whatever
  // the most recent successful fetch returned.
  variantInputsRef.current.deckSize = query.data?.deck_recipe_ids?.length ?? 0;

  if (!sessionId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center} testID="session-missing-id">
          <ThemedText type="small">No session id in the URL.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center} testID="session-loading">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!query.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="session-not-found">
          <ThemedText type="title">Session not found</ThemedText>
          <ThemedText type="small">It may have been ended or you don’t have access.</ThemedText>
          <Pressable style={styles.cta} onPress={() => router.replace('/home')}>
            <ThemedText type="small" style={styles.ctaText}>
              Back to home
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const session = query.data;
  const deckSize = session.deck_recipe_ids?.length ?? 0;

  if (session.status === 'lobby') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="session-lobby">
          <ThemedText type="title">Lobby</ThemedText>
          <ThemedText type="small">
            {deckSize} recipes ready to swipe through with your partner.
          </ThemedText>

          <Pressable
            testID="session-start-swiping"
            style={[styles.cta, activateMutation.isPending && styles.ctaDisabled]}
            disabled={activateMutation.isPending}
            onPress={() => activateMutation.mutate()}
          >
            <ThemedText type="small" style={styles.ctaText}>
              {activateMutation.isPending ? 'Starting…' : 'Start swiping'}
            </ThemedText>
          </Pressable>

          {activateMutation.isError ? (
            <ThemedText type="small" testID="session-activate-error">
              {activateMutation.error instanceof SessionRpcError &&
              activateMutation.error.code === 'session_not_pending'
                ? 'This session has already ended.'
                : 'Couldn’t start the session. Please try again.'}
            </ThemedText>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (session.status === 'active') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="session-active">
          <PartnerProgressDots
            recipeIds={session.deck_recipe_ids ?? []}
            localSet={localCommittedRecipeIds}
            partnerSet={partnerCommittedRecipeIds}
          />
          <SwipeDeck
            sessionId={session.id}
            recipeIds={session.deck_recipe_ids ?? []}
            onMatch={handleLocalMatch}
            onLocalCommit={handleLocalCommit}
            partnerRightCommittedRecipeIds={partnerRightCommittedRecipeIds}
          />
        </View>
        {matchPayload ? (
          <MatchOverlay
            payload={matchPayload}
            variant={matchVariant}
            onClose={() => setMatchPayload(null)}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <SessionSummary
        sessionId={session.id}
        podId={session.pod_id}
        endedReason={session.ended_reason}
      />
    </SafeAreaView>
  );
}

type DotState = 'full' | 'half' | 'empty';

function PartnerProgressDots({
  recipeIds,
  localSet,
  partnerSet,
}: {
  recipeIds: string[];
  localSet: Set<string>;
  partnerSet: Set<string>;
}) {
  if (recipeIds.length === 0) return null;
  return (
    <View testID="session-progress-dots" style={styles.dotRow} accessibilityRole="progressbar">
      {recipeIds.map((id) => {
        const local = localSet.has(id);
        const partner = partnerSet.has(id);
        const state: DotState = local && partner ? 'full' : local || partner ? 'half' : 'empty';
        return (
          <View
            key={id}
            testID={`session-progress-dot-${id}`}
            accessibilityLabel={`Progress: ${state}`}
            style={[
              styles.dot,
              state === 'full' && styles.dotFull,
              state === 'half' && styles.dotHalf,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.bgCard.light,
    marginTop: Spacing.three,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: DesignTokens.color.textOnDark, fontWeight: '600' },
  dotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: DesignTokens.radius.sm,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: DesignTokens.color.dotEmptyBorder,
  },
  // One side swiped: half-tone fill (partial commitment).
  dotHalf: { backgroundColor: DesignTokens.color.dotHalfFill },
  // Both swiped: full neutral fill — color-blind safe (no green/red split).
  dotFull: {
    backgroundColor: DesignTokens.color.dotFullFill,
    borderColor: DesignTokens.color.dotFullFill,
  },
});
