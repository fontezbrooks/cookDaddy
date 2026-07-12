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
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchOverlay, type MatchOverlayPayload } from '@/components/match-overlay';
import { PrimaryButton } from '@/components/primary-button';
import { SessionSummary } from '@/components/session-summary';
import { SwipeDeck, type OnLocalCommitPayload, type OnMatchPayload } from '@/components/swipe-deck';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { determineMatchVariant, type MatchVariant } from '@/lib/match-variant';
import {
  getSession,
  markSessionActive,
  type SessionRead,
  SessionRpcError,
} from '@/lib/session-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodMatchCount } from '@/lib/use-pod-matches';
import { useSwipeBroadcast } from '@/lib/use-swipe-broadcast';

type SessionRow = SessionRead;

export default function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const { capture } = useAnalytics();

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
  const lobbyEnteredAtRef = useRef<number | null>(null);
  const previousStatusRef = useRef<SessionRow['status'] | null>(null);
  const readyFiredRef = useRef(false);
  const prevPartnerSizeRef = useRef(0);
  const firstEverFiredForRef = useRef<string | null>(null);

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
    // Partner can flip to active any time — poll cheaply. But stop hammering
    // while errored (the retry card's invalidate resumes the poll).
    refetchInterval: (q) => (q.state.status === 'error' ? false : 2000),
    // get_session RPC (028): the RLS SELECT of sessions returns nothing on
    // device while definer RPCs work — same class 027 fixed for membership.
    queryFn: (): Promise<SessionRow | null> => getSession(supabase, sessionId as string),
  });

  const session = query.data;

  const activateMutation = useMutation({
    mutationFn: () => markSessionActive(supabase, sessionId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', sessionId] });
    },
  });

  // Keep deckSize in the variant ref synced from the loaded session row.
  // Lives outside `query.data` access so the ref's deckSize is whatever
  // the most recent successful fetch returned.
  variantInputsRef.current.deckSize = session?.deck_recipe_ids?.length ?? 0;

  useEffect(() => {
    if (!session) return;

    if (session.status === 'lobby' && lobbyEnteredAtRef.current == null) {
      lobbyEnteredAtRef.current = Date.now();
    }

    if (
      session.status === 'active' &&
      previousStatusRef.current === 'lobby' &&
      !readyFiredRef.current
    ) {
      readyFiredRef.current = true;
      // Dual-ready presence UX is deferred (P6b.2); both_ready_within_ms is the lobby→active elapsed proxy.
      capture('session_ready_state', {
        session_id: sessionId as string,
        both_ready_within_ms:
          lobbyEnteredAtRef.current == null ? 0 : Date.now() - lobbyEnteredAtRef.current,
      });
    }

    previousStatusRef.current = session.status;
  }, [capture, session, sessionId]);

  useEffect(() => {
    const partnerSize = partnerCommittedRecipeIds.size;
    if (partnerSize > prevPartnerSizeRef.current) {
      capture('swipe_progress_seen', {
        session_id: sessionId as string,
        partner_offset: partnerSize - localCommittedRecipeIds.size,
      });
    }
    prevPartnerSizeRef.current = partnerSize;
  }, [capture, localCommittedRecipeIds.size, partnerCommittedRecipeIds.size, sessionId]);

  useEffect(() => {
    if (!session || !matchPayload || matchVariant !== 'firstEver') return;
    if (firstEverFiredForRef.current === matchPayload.matchId) return;

    firstEverFiredForRef.current = matchPayload.matchId;
    const createdAt = session.pods?.created_at;
    const timeSincePodCreatedMin = createdAt
      ? Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000)
      : 0;
    capture('match_first_ever', {
      pod_id: session.pod_id,
      time_since_pod_created_min: timeSincePodCreatedMin,
    });
  }, [capture, matchPayload, matchVariant, session]);

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

  // A failed read is NOT "not found" — offer a retry instead of a dead end
  // (docs/POD-READ-PATH/README.md FR-2 pattern).
  if (query.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="session-error">
          <ThemedText type="title">Couldn’t load this session</ThemedText>
          <ThemedText type="small">Check your connection and try again.</ThemedText>
          <PrimaryButton
            testID="session-error-retry"
            onPress={() => queryClient.invalidateQueries({ queryKey: ['sessions', sessionId] })}
            title="Try again"
            style={{ marginTop: Spacing.three }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="session-not-found">
          <ThemedText type="title">Session not found</ThemedText>
          <ThemedText type="small">It may have been ended or you don’t have access.</ThemedText>
          <PrimaryButton
            onPress={() => router.replace('/home')}
            title="Back to home"
            style={{ marginTop: Spacing.three }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const deckSize = session.deck_recipe_ids?.length ?? 0;

  if (session.status === 'lobby') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="session-lobby">
          <ThemedText type="title">Lobby</ThemedText>
          <ThemedText type="small">
            {deckSize} recipes ready to swipe through with your partner.
          </ThemedText>

          <PrimaryButton
            testID="session-start-swiping"
            disabled={activateMutation.isPending}
            onPress={() => activateMutation.mutate()}
            title={activateMutation.isPending ? 'Starting…' : 'Start swiping'}
            style={{ marginTop: Spacing.three }}
          />

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
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    borderColor: DesignTokens.color.borderStrong.light,
  },
  // One side swiped: half-tone fill (partial commitment).
  dotHalf: { backgroundColor: DesignTokens.color.accent },
  // Both swiped: full neutral fill — color-blind safe (no green/red split).
  dotFull: {
    backgroundColor: DesignTokens.color.brandDeep.light,
    borderColor: DesignTokens.color.brandDeep.light,
  },
});
