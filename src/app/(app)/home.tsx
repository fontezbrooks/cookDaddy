// Home — minimal P5 landing. Reads the signed-in user's display_name from
// Supabase, surfaces a "No pod yet" empty state with a Create-invite CTA that
// mints a token via create_pod_invite() and opens the native Share sheet so
// the inviter can hand the link to their partner.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { createPodInvite, PodRpcError } from '@/lib/pod-rpcs';
import { startSession } from '@/lib/session-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { useDeckSizeFlag } from '@/lib/use-deck-size-flag';
import { usePodStore } from '@/state/usePodStore';

const INVITE_BASE_URL = 'https://cookdaddy.app/invite/';

export default function HomeScreen() {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const activePodId = usePodStore((s) => s.activePodId);
  const partnerRemoved = usePodStore((s) => s.partnerRemoved);
  const acknowledgePartnerRemoved = usePodStore((s) => s.acknowledgePartnerRemoved);
  const deckSize = useDeckSizeFlag();
  const [inviteHint, setInviteHint] = useState<string | null>(null);

  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const { data, isLoading } = useQuery({
    queryKey: ['users', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000, // user profile rarely changes between sessions
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('users')
        .select('display_name, avatar_url')
        .eq('id', userId as string)
        .single();
      if (error) throw new Error(error.message);
      return row as { display_name: string; avatar_url: string | null };
    },
  });

  const startSessionMutation = useMutation({
    mutationFn: () => {
      if (!activePodId) throw new Error('no active pod');
      return startSession(supabase, activePodId, deckSize);
    },
    onSuccess: ({ sessionId }) => {
      router.push(`/session/${sessionId}` as never);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => createPodInvite(supabase),
    onSuccess: async ({ token }) => {
      try {
        await Share.share({
          message: `Pair with me on cookDaddy: ${INVITE_BASE_URL}${token}`,
          url: `${INVITE_BASE_URL}${token}`,
        });
        setInviteHint('Link shared. Waiting for your partner to tap it.');
      } catch {
        // Share sheet was dismissed — the invite still exists server-side.
        setInviteHint('Invite created. Share it anytime from this screen.');
      }
    },
    onError: (err) => {
      if (err instanceof PodRpcError && err.code === 'already_in_a_pod') {
        setInviteHint('You’re already paired. Reload to see your pod.');
      } else {
        setInviteHint('Couldn’t create an invite. Please try again.');
      }
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title" testID="home-greeting">
          {isLoading ? 'Welcome…' : `Welcome, ${data?.display_name ?? 'there'}`}
        </ThemedText>

        {partnerRemoved ? (
          <View style={styles.banner} testID="partner-removed-banner">
            <ThemedText type="small">Your partner left the pod.</ThemedText>
            <Pressable
              testID="partner-removed-ack"
              onPress={acknowledgePartnerRemoved}
              style={styles.bannerAck}
            >
              <ThemedText type="small" style={styles.ctaText}>
                Got it
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {activePodId ? (
          <View style={styles.paired} testID="home-paired">
            <ThemedText type="small">Pod active. Ready to swipe?</ThemedText>

            <Pressable
              testID="home-start-session"
              style={[styles.cta, startSessionMutation.isPending && styles.ctaDisabled]}
              disabled={startSessionMutation.isPending}
              onPress={() => startSessionMutation.mutate()}
            >
              <ThemedText type="small" style={styles.ctaText}>
                {startSessionMutation.isPending ? 'Starting…' : 'Start a session'}
              </ThemedText>
            </Pressable>

            {startSessionMutation.isError ? (
              <ThemedText type="small" testID="home-start-session-error">
                Couldn’t start a session. Please try again.
              </ThemedText>
            ) : null}

            <Link href="/settings/pod" testID="home-manage-pod">
              <ThemedText type="small">→ Manage pod</ThemedText>
            </Link>
          </View>
        ) : (
          <View style={styles.emptyState} testID="home-empty-state">
            <ThemedText type="small">No pod yet.</ThemedText>
            <ThemedText type="small">
              Invite your partner to start deciding what&apos;s for dinner.
            </ThemedText>

            <Pressable
              testID="home-create-invite"
              style={[styles.cta, inviteMutation.isPending && styles.ctaDisabled]}
              disabled={inviteMutation.isPending}
              onPress={() => inviteMutation.mutate()}
            >
              <ThemedText type="small" style={styles.ctaText}>
                {inviteMutation.isPending ? 'Creating link…' : 'Create invite link'}
              </ThemedText>
            </Pressable>

            {inviteHint ? (
              <ThemedText type="small" testID="home-invite-hint">
                {inviteHint}
              </ThemedText>
            ) : null}

            <Link href="/settings/profile" testID="home-cta-profile">
              <ThemedText type="small">→ Set up your profile</ThemedText>
            </Link>
          </View>
        )}

        <Link href="/shopping" testID="home-cta-shopping">
          <ThemedText type="small">→ Shopping list</ThemedText>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  paired: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  emptyState: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    backgroundColor: '#111',
    marginTop: Spacing.two,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: 12,
    backgroundColor: '#f3e9d2',
    gap: Spacing.three,
  },
  bannerAck: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 8,
    backgroundColor: '#111',
  },
});
