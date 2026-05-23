// Live-sync swipe session screen. Renders one of three states based on
// sessions.status:
//   • lobby  → "Start swiping" button calls mark_session_active.
//   • active → deck placeholder (real deck lands in P6c).
//   • ended  → summary placeholder (lands later in P6).
//
// v0 transitions to active on a single tap from either partner. The
// presence-driven "both must be ready" UX is a P6b.2 enhancement; the
// server already accepts either client calling mark_session_active because
// the RPC is idempotent.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { markSessionActive, SessionRpcError } from '@/lib/session-rpcs';
import { createSupabaseClient } from '@/lib/supabase';

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
          <ThemedText type="title">Swiping</ThemedText>
          <ThemedText type="small">
            {deckSize} recipes in deck. Swipe gestures + match overlay land in P6c.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // ended
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container} testID="session-ended">
        <ThemedText type="title">Session ended</ThemedText>
        <ThemedText type="small">
          {session.ended_reason ? `Reason: ${session.ended_reason}.` : 'Thanks for swiping.'}
        </ThemedText>
        <Pressable style={styles.cta} onPress={() => router.replace('/home')}>
          <ThemedText type="small" style={styles.ctaText}>
            Back to home
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
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
    borderRadius: 12,
    backgroundColor: '#111',
    marginTop: Spacing.three,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontWeight: '600' },
});
