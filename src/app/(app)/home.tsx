// Home — minimal P4 landing. Reads the signed-in user's display_name from
// Supabase (via TanStack Query) and surfaces a "No pod yet" empty state.
// Pod-aware home (deck CTA, partner badge, session indicator) lands in P5+.

import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

export default function HomeScreen() {
  const { userId, getToken } = useAuth();
  const activePodId = usePodStore((s) => s.activePodId);

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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title" testID="home-greeting">
          {isLoading ? 'Welcome…' : `Welcome, ${data?.display_name ?? 'there'}`}
        </ThemedText>

        {activePodId ? (
          <ThemedText type="small">Pod active. Swipe deck lands in P6.</ThemedText>
        ) : (
          <View style={styles.emptyState} testID="home-empty-state">
            <ThemedText type="small">No pod yet.</ThemedText>
            <ThemedText type="small">
              Invite your partner to start deciding what&apos;s for dinner.
            </ThemedText>
            <Link href="/settings/profile" testID="home-cta-profile">
              <ThemedText type="small">→ Set up your profile</ThemedText>
            </Link>
          </View>
        )}
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
  emptyState: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
});
