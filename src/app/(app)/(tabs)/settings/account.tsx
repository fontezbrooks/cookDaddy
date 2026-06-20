import { useAuth, useUser } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { useAuthStore } from '@/state/useAuthStore';
import { usePodStore } from '@/state/usePodStore';

export default function AccountSettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const clearUser = useAuthStore((s) => s.clearUser);
  const clearActivePod = usePodStore((s) => s.clearActivePod);

  const teardown = useCallback(async () => {
    await signOut();
    analytics.reset();
    clearUser();
    clearActivePod();
    queryClient.clear();
    router.replace('/(auth)/sign-in');
  }, [signOut, analytics, clearUser, clearActivePod, queryClient, router]);

  const signOutMutation = useMutation({ mutationFn: teardown });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('not signed in');
      await user.delete();
      await teardown();
    },
  });

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      "This permanently removes your account and all your data. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title">Account</ThemedText>

        <Pressable
          testID="account-sign-out"
          accessibilityRole="button"
          disabled={signOutMutation.isPending}
          onPress={() => signOutMutation.mutate()}
          style={[styles.secondary, signOutMutation.isPending && styles.disabled]}
        >
          <ThemedText type="small" style={styles.secondaryText}>
            {signOutMutation.isPending ? 'Signing out…' : 'Sign out'}
          </ThemedText>
        </Pressable>

        <Pressable
          testID="account-delete"
          accessibilityRole="button"
          disabled={deleteMutation.isPending}
          onPress={confirmDelete}
          style={[styles.destructive, deleteMutation.isPending && styles.disabled]}
        >
          <ThemedText type="small" style={styles.destructiveText}>
            {deleteMutation.isPending ? 'Deleting…' : 'Delete account'}
          </ThemedText>
        </Pressable>

        {signOutMutation.isError || deleteMutation.isError ? (
          <ThemedText type="small" testID="account-error">
            Something went wrong. Please try again.
          </ThemedText>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  secondary: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: DesignTokens.color.borderMuted.light,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: DesignTokens.color.surface.light,
  },
  secondaryText: { color: DesignTokens.color.ink.light, fontWeight: '600' },
  destructive: {
    marginTop: Spacing.three,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    backgroundColor: DesignTokens.color.dangerDeep,
  },
  destructiveText: { color: DesignTokens.color.textOnDark, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
