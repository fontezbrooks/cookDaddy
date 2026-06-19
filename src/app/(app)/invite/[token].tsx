// Invite deep-link target. Consumes the share-link token via the
// consume_pod_invite RPC, joins the inviter's pod, and replaces to /home.
// Unsigned users are bounced to sign-in with a redirect-back param so the
// consume happens on their first authenticated mount.
//
// Spec: docs/DESIGN/README.md §8.3, docs/WORKFLOW/README.md §8.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import {
  consumePodInvite,
  fetchPartnerForPod,
  PodRpcError,
  type PodRpcErrorCode,
} from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

const ERROR_COPY: Record<PodRpcErrorCode, { title: string; body: string }> = {
  invite_not_found: {
    title: 'Invalid invite link',
    body: 'We couldn’t find that invite. Ask your partner to share a new link.',
  },
  invite_expired: {
    title: 'This link expired',
    body: 'Pod invites are good for 24 hours. Ask your partner for a fresh one.',
  },
  invite_already_consumed: {
    title: 'This invite was already used',
    body: 'Someone else has already paired with this link.',
  },
  cannot_consume_own_invite: {
    title: 'That’s your own invite',
    body: 'Share this link with your partner — you can’t pair with yourself.',
  },
  consumer_already_in_a_pod: {
    title: 'You’re already paired',
    body: 'Leave your current pod from Settings before joining a new one.',
  },
  already_in_a_pod: {
    title: 'You’re already paired',
    body: 'Leave your current pod from Settings before joining a new one.',
  },
  not_member: {
    title: 'Something went wrong',
    body: 'Please try again.',
  },
  unauthenticated: {
    title: 'Please sign in',
    body: 'You need to be signed in to accept an invite.',
  },
  unknown: {
    title: 'Something went wrong',
    body: 'We couldn’t accept the invite right now. Please try again.',
  },
};

export default function InviteTokenScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const startedRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!token || !userId) throw new PodRpcError('unknown', 'missing token or session');
      const result = await consumePodInvite(supabase, token);
      const partner = await fetchPartnerForPod(supabase, result.podId, userId);
      return { result, partner };
    },
    onSuccess: ({ result, partner }) => {
      usePodStore.getState().setActivePod({
        podId: result.podId,
        partnerId: partner?.partnerId ?? '',
        partnerDisplayName: partner?.partnerDisplayName ?? 'Your partner',
      });
      router.replace('/home');
    },
  });

  // Kick off the consume exactly once per mount, after Clerk has hydrated.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || startedRef.current) return;
    startedRef.current = true;
    mutation.mutate();
  }, [isLoaded, isSignedIn, token, mutation]);

  if (isLoaded && !isSignedIn) {
    const redirect = encodeURIComponent(`/invite/${token ?? ''}`);
    return <Redirect href={`/(auth)/sign-in?redirect=${redirect}` as never} />;
  }

  if (!isLoaded || mutation.isPending) {
    return (
      <SafeAreaView style={styles.safe} testID="invite-loading">
        <View style={styles.center}>
          <ActivityIndicator />
          <ThemedText type="small">Joining your partner’s pod…</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (mutation.isError) {
    const code: PodRpcErrorCode =
      mutation.error instanceof PodRpcError ? mutation.error.code : 'unknown';
    const copy = ERROR_COPY[code];
    return (
      <SafeAreaView style={styles.safe} testID={`invite-error-${code}`}>
        <View style={styles.container}>
          <ThemedText type="subtitle">{copy.title}</ThemedText>
          <ThemedText type="small">{copy.body}</ThemedText>
          <PrimaryButton
            testID="invite-home-cta"
            onPress={() => router.replace('/home')}
            title="Go home"
            style={{ marginTop: Spacing.three }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
