import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { formatInviteCode, sanitizeCodeInput } from '@/lib/invite-code';
import { INVITE_ERROR_COPY } from '@/lib/invite-error-copy';
import { consumePodInvite, PodRpcError, type PodRpcErrorCode } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

export default function JoinScreen() {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new PodRpcError('unknown', 'no session');
      return consumePodInvite(supabase, code);
    },
    onSuccess: (result) => {
      // Provisional store update so Home doesn't flash the empty state; the
      // membership refetch fills in the partner via get_my_pod (FR-1).
      usePodStore.getState().setActivePod({
        podId: result.podId,
        partnerId: '',
        partnerDisplayName: 'Your partner',
      });
      queryClient.invalidateQueries({ queryKey: ['pod-membership', userId] });
      router.replace('/home');
    },
    onError: (err) => {
      // Self-heal (FR-3): the server says we're already in a pod the client
      // doesn't know about — refetch the membership.
      if (err instanceof PodRpcError && err.code === 'consumer_already_in_a_pod') {
        queryClient.invalidateQueries({ queryKey: ['pod-membership', userId] });
      }
    },
  });

  const errorCode: PodRpcErrorCode =
    mutation.isError && mutation.error instanceof PodRpcError ? mutation.error.code : 'unknown';
  const errorCopy = INVITE_ERROR_COPY[errorCode];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <AppBar title="Join a pod" onBack={() => router.back()} />
        <View style={styles.content}>
          <ThemedText type="small">Enter the code your partner shared.</ThemedText>
          <TextInput
            testID="join-code-input"
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={`Invite code ${formatInviteCode(code)}`}
            value={code}
            placeholder="ABCD-1234"
            onChangeText={(t) => setCode(sanitizeCodeInput(t))}
            style={styles.input}
          />
          <PrimaryButton
            testID="join-submit"
            title={mutation.isPending ? 'Joining…' : 'Join pod'}
            disabled={code.length !== 8 || mutation.isPending}
            onPress={() => mutation.mutate()}
          />
          {mutation.isError ? (
            <View style={styles.error}>
              <ThemedText testID={`join-error-${errorCode}`} type="subtitle">
                {errorCopy.title}
              </ThemedText>
              <ThemedText type="small">{errorCopy.body}</ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1 },
  content: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  input: {
    borderWidth: 1,
    borderColor: DesignTokens.color.borderWarm.light,
    borderRadius: DesignTokens.radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    color: DesignTokens.color.ink.light,
    fontFamily: DesignTokens.fontFamily.bodySemibold,
    fontSize: 20,
    lineHeight: 28,
  },
  error: { gap: Spacing.one },
});
