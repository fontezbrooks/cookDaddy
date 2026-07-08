// Profile editor — name + avatar URL persisted to the users table.
// RLS (users_self_update) restricts writes to the owning user; the screen
// never explicitly sends user_id since the WHERE auth_user_id() filter is
// applied server-side.

import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { createSupabaseClient } from '@/lib/supabase';

type UserRow = { display_name: string | null; avatar_url: string | null };

export default function ProfileScreen() {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const { data } = useQuery({
    queryKey: ['users', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('users')
        .select('display_name, avatar_url')
        .eq('id', userId as string)
        .single();
      if (error) throw new Error(error.message);
      return row as UserRow;
    },
  });

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Sync form state with the fetched row once it lands. The effect re-runs
  // when the query refetches; keeps the inputs in sync with the source of truth.
  useEffect(() => {
    if (data) {
      setDisplayName(data.display_name ?? '');
      setAvatarUrl(data.avatar_url ?? '');
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('not signed in');
      const { error } = await supabase
        .from('users')
        .update({ display_name: displayName, avatar_url: avatarUrl || null })
        .eq('id', userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <AppBar title="Profile" onBack={() => router.back()} />
        <ThemedText type="small">Update how your partner sees you.</ThemedText>

        <View style={styles.field}>
          <ThemedText type="small">Display name</ThemedText>
          <TextInput
            testID="profile-display-name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={DesignTokens.color.inkPlaceholder}
            style={styles.input}
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Avatar URL</ThemedText>
          <TextInput
            testID="profile-avatar-url"
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://…"
            placeholderTextColor={DesignTokens.color.inkPlaceholder}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <PrimaryButton
          testID="profile-save"
          disabled={updateMutation.isPending || displayName.length === 0}
          onPress={() => updateMutation.mutate()}
          title={updateMutation.isPending ? 'Saving…' : 'Save changes'}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderColor: DesignTokens.color.accentBorderAlt,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: DesignTokens.radius.md,
    color: DesignTokens.color.ink.light,
    backgroundColor: DesignTokens.color.surface.light,
  },
});
