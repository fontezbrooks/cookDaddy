import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';
import { startSession } from '@/lib/session-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { useDeckSizeFlag } from '@/lib/use-deck-size-flag';
import { type SessionMatch, useSessionMatches } from '@/lib/use-session-matches';

type SessionSummaryProps = {
  sessionId: string;
  podId: string;
  endedReason: string | null;
};

type BranchProps = {
  disabled: boolean;
  onStartNew: () => void;
};

export function SessionSummary({ sessionId, podId, endedReason }: SessionSummaryProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const deckSize = useDeckSizeFlag();
  const { data: matches, isLoading } = useSessionMatches(sessionId);
  const startSessionMutation = useMutation({
    mutationFn: () => startSession(supabase, podId, deckSize),
    onSuccess: (result) => router.replace(`/session/${result.sessionId}`),
  });

  if (isLoading) {
    return (
      <View style={styles.loading} testID="session-summary-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (endedReason === 'partner_disconnect') {
    return (
      <DisconnectedSummary
        disabled={startSessionMutation.isPending}
        onBackHome={() => router.replace('/home')}
        onStartNew={() => startSessionMutation.mutate()}
      />
    );
  }

  if ((matches?.length ?? 0) > 0) {
    return (
      <WithMatchesSummary
        disabled={startSessionMutation.isPending}
        matches={matches ?? []}
        onOpenCookbook={() => router.push('/cookbook')}
        onOpenMatch={(matchId) => router.push(`/cookbook/${matchId}`)}
        onStartNew={() => startSessionMutation.mutate()}
      />
    );
  }

  return (
    <NoMatchesSummary
      disabled={startSessionMutation.isPending}
      onAdjustFilters={() => router.push('/settings/dietary')}
      onBackHome={() => router.replace('/home')}
      onStartNew={() => startSessionMutation.mutate()}
    />
  );
}

function DisconnectedSummary({
  disabled,
  onBackHome,
  onStartNew,
}: BranchProps & { onBackHome: () => void }) {
  return (
    <View style={styles.container} testID="session-summary-disconnected">
      <ThemedText type="title">Partner stepped away</ThemedText>
      <ThemedText type="default">Want to keep swiping solo, or wrap up?</ThemedText>
      <Pressable testID="session-summary-end" style={styles.primaryCta} onPress={onBackHome}>
        <ThemedText type="smallBold" style={styles.primaryText}>
          Back to home
        </ThemedText>
      </Pressable>
      {/* Per PRD NG2 solo-swipe is out of v1; the spec's 5-min grace / suspended-deck recovery is deferred, so v1 keeps the pod intact and offers a fresh session. */}
      <Pressable
        disabled={disabled}
        testID="session-summary-start-new"
        style={[styles.secondaryCta, disabled && styles.ctaDisabled]}
        onPress={onStartNew}
      >
        <ThemedText type="smallBold">Start a new session</ThemedText>
      </Pressable>
    </View>
  );
}

function WithMatchesSummary({
  disabled,
  matches,
  onOpenCookbook,
  onOpenMatch,
  onStartNew,
}: BranchProps & {
  matches: SessionMatch[];
  onOpenCookbook: () => void;
  onOpenMatch: (matchId: string) => void;
}) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    haptics.notificationSuccess();
  }, []);

  const count = matches.length;
  return (
    <View style={styles.container} testID="session-summary-with-matches">
      <ThemedText type="display" style={styles.hero}>
        {count} {count === 1 ? 'match' : 'matches'}!
      </ThemedText>
      <View style={styles.grid}>
        {matches.map((match) => (
          <MatchTile key={match.matchId} match={match} onPress={() => onOpenMatch(match.matchId)} />
        ))}
      </View>
      <Pressable
        testID="session-summary-pick-dinner"
        style={styles.primaryCta}
        onPress={onOpenCookbook}
      >
        <ThemedText type="smallBold" style={styles.primaryText}>
          Pick tonight’s dinner →
        </ThemedText>
      </Pressable>
      <Pressable
        disabled={disabled}
        testID="session-summary-swipe-more"
        style={[styles.secondaryCta, disabled && styles.ctaDisabled]}
        onPress={onStartNew}
      >
        <ThemedText type="smallBold">Swipe more recipes</ThemedText>
      </Pressable>
    </View>
  );
}

function MatchTile({ match, onPress }: { match: SessionMatch; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={`session-summary-match-${match.matchId}`}
      style={styles.tile}
      onPress={onPress}
    >
      {match.imageUrl ? (
        <Image source={{ uri: match.imageUrl }} style={styles.tileImage} contentFit="cover" />
      ) : (
        <View style={styles.tilePlaceholder} />
      )}
      <ThemedText type="smallBold" numberOfLines={2}>
        {match.title}
      </ThemedText>
    </Pressable>
  );
}

function NoMatchesSummary({
  disabled,
  onAdjustFilters,
  onBackHome,
  onStartNew,
}: BranchProps & { onAdjustFilters: () => void; onBackHome: () => void }) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    haptics.selection();
  }, []);

  return (
    <View style={styles.container} testID="session-summary-no-matches">
      <ThemedText type="default">
        Round complete! No matches yet. Tastes are picky tonight — try another round?
      </ThemedText>
      <Pressable
        disabled={disabled}
        testID="session-summary-try-again"
        style={[styles.primaryCta, disabled && styles.ctaDisabled]}
        onPress={onStartNew}
      >
        <ThemedText type="smallBold" style={styles.primaryText}>
          Try another deck
        </ThemedText>
      </Pressable>
      <Pressable
        testID="session-summary-adjust-filters"
        style={styles.secondaryCta}
        onPress={onAdjustFilters}
      >
        <ThemedText type="smallBold">Adjust filters</ThemedText>
      </Pressable>
      <Pressable testID="session-summary-done" style={styles.tertiaryCta} onPress={onBackHome}>
        <ThemedText type="smallBold">Done for now</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    gap: DesignTokens.space.three,
    padding: DesignTokens.space.four,
  },
  hero: {
    fontSize: DesignTokens.fontSize.display,
    lineHeight: DesignTokens.fontSize.display + DesignTokens.space.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DesignTokens.space.two,
  },
  tile: {
    width: 132,
    gap: DesignTokens.space.two,
    borderRadius: DesignTokens.radius.md,
  },
  tileImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.bgElevated.light,
  },
  tilePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.bgElevated.light,
  },
  primaryCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: DesignTokens.space.three,
    paddingVertical: DesignTokens.space.two,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.bgCard.light,
  },
  secondaryCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: DesignTokens.space.three,
    paddingVertical: DesignTokens.space.two,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderMuted.light,
  },
  tertiaryCta: {
    alignSelf: 'flex-start',
    paddingVertical: DesignTokens.space.two,
  },
  primaryText: { color: DesignTokens.color.textOnDark },
  ctaDisabled: { opacity: 0.6 },
});
