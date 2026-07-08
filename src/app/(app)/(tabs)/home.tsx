// Home — minimal P5 landing. Reads the signed-in user's display_name from
// Supabase, surfaces a "No pod yet" empty state with a Create-invite CTA that
// mints a token via create_pod_invite() and opens the native Share sheet so
// the inviter can hand the link to their partner.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEFAULT_DIETARY_FLAGS,
  hasAnyDietaryFlag,
  type DietaryRow,
} from '@/components/dietary-chips';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { dissolvePod, PodRpcError } from '@/lib/pod-rpcs';
import { startSession } from '@/lib/session-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { useCreatePodInvite } from '@/lib/use-create-pod-invite';
import { useDeckSizeFlag } from '@/lib/use-deck-size-flag';
import { usePodStore } from '@/state/usePodStore';

export default function HomeScreen() {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const activePodId = usePodStore((s) => s.activePodId);
  const partnerRemoved = usePodStore((s) => s.partnerRemoved);
  const partnerDisplayName = usePodStore((s) => s.partnerDisplayName);
  const clearActivePod = usePodStore((s) => s.clearActivePod);
  const acknowledgePartnerRemoved = usePodStore((s) => s.acknowledgePartnerRemoved);
  const deckSize = useDeckSizeFlag();
  const { createInvite, hint: inviteHint, isPending: isInvitePending } = useCreatePodInvite();

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

  const { data: dietaryRow } = useQuery({
    queryKey: ['dietary_profiles', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('dietary_profiles')
        .select('*')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (row as DietaryRow | null) ?? { user_id: userId as string, ...DEFAULT_DIETARY_FLAGS };
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

  const leavePodMutation = useMutation({
    mutationFn: async () => {
      if (!activePodId) throw new PodRpcError('unknown', 'no active pod to leave');
      await dissolvePod(supabase, activePodId);
    },
    onSuccess: () => {
      clearActivePod();
    },
  });

  const confirmLeavePod = () => {
    const line = partnerDisplayName
      ? `This ends your pod with ${partnerDisplayName}.`
      : 'This ends your current pod and disables any invite link you sent.';
    Alert.alert('Leave pod?', `${line} This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave pod', style: 'destructive', onPress: () => leavePodMutation.mutate() },
    ]);
  };

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

            <PrimaryButton
              testID="home-start-session"
              disabled={startSessionMutation.isPending}
              onPress={() => startSessionMutation.mutate()}
              title={startSessionMutation.isPending ? 'Starting…' : 'Start a session'}
              style={{ marginTop: Spacing.two }}
            />

            {startSessionMutation.isError ? (
              <ThemedText type="small" testID="home-start-session-error">
                Couldn’t start a session. Please try again.
              </ThemedText>
            ) : null}

            <Link href="/settings/pod" testID="home-manage-pod">
              <ThemedText type="small">→ Manage pod</ThemedText>
            </Link>

            <Pressable
              testID="home-leave-pod"
              style={[styles.leavePod, leavePodMutation.isPending && styles.leavePodDisabled]}
              disabled={leavePodMutation.isPending}
              onPress={confirmLeavePod}
            >
              <ThemedText type="small" style={styles.leavePodText}>
                {leavePodMutation.isPending ? 'Leaving…' : 'Leave pod'}
              </ThemedText>
            </Pressable>

            {leavePodMutation.isError ? (
              <ThemedText type="small" testID="home-leave-pod-error">
                Couldn’t leave the pod. Please try again.
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyState} testID="home-empty-state">
            <ThemedText type="small">No pod yet.</ThemedText>
            <ThemedText type="small">
              Invite your partner to start deciding what&apos;s for dinner.
            </ThemedText>

            <PrimaryButton
              testID="home-create-invite"
              disabled={isInvitePending}
              onPress={() => createInvite()}
              title={isInvitePending ? 'Creating link…' : 'Create invite link'}
              style={{ marginTop: Spacing.two }}
            />

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

        {!hasAnyDietaryFlag(dietaryRow) ? (
          <Link href="/settings/dietary" testID="home-dietary-nudge">
            <ThemedText type="small">→ Set dietary preferences</ThemedText>
          </Link>
        ) : null}

        <Link href="/shopping" testID="home-cta-shopping">
          <ThemedText type="small">→ Shopping list</ThemedText>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  paired: {
    marginTop: Spacing.three,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.surface.light,
    ...DesignTokens.elevation.card,
  },
  emptyState: {
    marginTop: Spacing.four,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.surface.light,
    ...DesignTokens.elevation.card,
  },
  ctaText: { color: DesignTokens.color.onAccent, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.surface.light,
    gap: Spacing.three,
    ...DesignTokens.elevation.card,
  },
  bannerAck: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: DesignTokens.radius.pill,
    backgroundColor: DesignTokens.color.accent,
  },
  leavePod: {
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.pill,
    backgroundColor: DesignTokens.color.dangerDeep,
  },
  leavePodText: { color: DesignTokens.color.surface.light, fontWeight: '600' },
  leavePodDisabled: { opacity: 0.6 },
});
