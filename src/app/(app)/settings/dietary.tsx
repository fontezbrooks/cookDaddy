// Dietary preferences chip selector. Writes one row per user into
// dietary_profiles via upsert on user_id. RLS in supabase/migrations/003
// restricts read/write to the owning user via auth_user_id().

import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { createSupabaseClient } from '@/lib/supabase';

type DietaryRow = {
  user_id: string;
  vegetarian: boolean;
  vegan: boolean;
  gluten_free: boolean;
  dairy_free: boolean;
  low_fodmap: boolean;
};

type Flag = keyof Omit<DietaryRow, 'user_id'>;

const FLAGS: { key: Flag; label: string; testID: string }[] = [
  { key: 'vegetarian', label: 'Vegetarian', testID: 'chip-vegetarian' },
  { key: 'vegan', label: 'Vegan', testID: 'chip-vegan' },
  { key: 'gluten_free', label: 'Gluten-free', testID: 'chip-gluten-free' },
  { key: 'dairy_free', label: 'Dairy-free', testID: 'chip-dairy-free' },
  { key: 'low_fodmap', label: 'Low FODMAP', testID: 'chip-low-fodmap' },
];

const DEFAULTS: Omit<DietaryRow, 'user_id'> = {
  vegetarian: false,
  vegan: false,
  gluten_free: false,
  dairy_free: false,
  low_fodmap: false,
};

export default function DietaryScreen() {
  const { userId, getToken } = useAuth();
  const queryClient = useQueryClient();

  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const { data: row } = useQuery({
    queryKey: ['dietary_profiles', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dietary_profiles')
        .select('*')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as DietaryRow | null) ?? { user_id: userId as string, ...DEFAULTS };
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (flag: Flag) => {
      if (!userId) throw new Error('not signed in');
      const current = row ?? { user_id: userId, ...DEFAULTS };
      const next = { ...current, [flag]: !current[flag], user_id: userId };
      const { error } = await supabase
        .from('dietary_profiles')
        .upsert(next, { onConflict: 'user_id' })
        .select();
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['dietary_profiles', userId], next);
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title">Dietary preferences</ThemedText>
        <ThemedText type="small">
          Recipes that conflict with these will be filtered out of your decks.
        </ThemedText>

        <View style={styles.chipRow}>
          {FLAGS.map((flag) => {
            const active = Boolean(row?.[flag.key]);
            return (
              <Pressable
                key={flag.key}
                testID={flag.testID}
                onPress={() => toggleMutation.mutate(flag.key)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <ThemedText type="small" style={active ? styles.chipTextActive : styles.chipText}>
                  {flag.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  chip: {
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { color: '#111' },
  chipTextActive: { color: '#fff' },
});
