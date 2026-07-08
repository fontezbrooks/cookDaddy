// Pod management screen. Currently exposes a single destructive action:
// dissolve the active pod. Either partner may dissolve (server-side check in
// dissolve_pod RPC); both sides see the partner-removed-me banner on next
// foreground via usePodSync.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { dissolvePod, PodRpcError } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

export default function PodSettingsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const activePodId = usePodStore((s) => s.activePodId);
  const partnerDisplayName = usePodStore((s) => s.partnerDisplayName);
  const clearActivePod = usePodStore((s) => s.clearActivePod);

  const dissolveMutation = useMutation({
    mutationFn: async () => {
      if (!activePodId) throw new PodRpcError('unknown', 'no active pod to dissolve');
      await dissolvePod(supabase, activePodId);
    },
    onSuccess: () => {
      clearActivePod();
      router.replace('/home');
    },
  });

  const confirmDissolve = () => {
    const partnerLine = partnerDisplayName
      ? `This ends your pod with ${partnerDisplayName}.`
      : 'This ends your pod.';
    Alert.alert(
      'Dissolve pod?',
      `${partnerLine} You’ll both lose the shared cookbook and shopping list. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dissolve',
          style: 'destructive',
          onPress: () => dissolveMutation.mutate(),
        },
      ],
    );
  };

  if (!activePodId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="pod-settings-empty">
          <AppBar title="Pod" onBack={() => router.back()} />
          <ThemedText type="small">You’re not in a pod yet.</ThemedText>
          <Link href="/home" testID="pod-settings-empty-cta">
            <ThemedText type="small">→ Create an invite from Home</ThemedText>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <AppBar title="Pod" onBack={() => router.back()} />
        <ThemedText type="small" testID="pod-settings-partner">
          Paired with {partnerDisplayName ?? 'your partner'}.
        </ThemedText>

        <Pressable
          testID="pod-settings-dissolve"
          style={[styles.destructive, dissolveMutation.isPending && styles.disabled]}
          disabled={dissolveMutation.isPending}
          onPress={confirmDissolve}
        >
          <ThemedText type="small" style={styles.destructiveText}>
            {dissolveMutation.isPending ? 'Dissolving…' : 'Dissolve pod'}
          </ThemedText>
        </Pressable>

        {dissolveMutation.isError ? (
          <ThemedText type="small" testID="pod-settings-error">
            Couldn’t dissolve the pod. Please try again.
          </ThemedText>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  destructive: {
    marginTop: Spacing.three,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.pill,
    backgroundColor: DesignTokens.color.dangerDeep,
  },
  destructiveText: { color: DesignTokens.color.surface.light, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
