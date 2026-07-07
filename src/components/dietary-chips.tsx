import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { createSupabaseClient } from '@/lib/supabase';

import { ThemedText } from './themed-text';

export type DietaryRow = {
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

export const DEFAULT_DIETARY_FLAGS: Omit<DietaryRow, 'user_id'> = {
  vegetarian: false,
  vegan: false,
  gluten_free: false,
  dairy_free: false,
  low_fodmap: false,
};

export function hasAnyDietaryFlag(row: DietaryRow | null | undefined): boolean {
  return Boolean(
    row?.vegetarian || row?.vegan || row?.gluten_free || row?.dairy_free || row?.low_fodmap,
  );
}

export function DietaryChips() {
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
      return (data as DietaryRow | null) ?? { user_id: userId as string, ...DEFAULT_DIETARY_FLAGS };
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (flag: Flag) => {
      if (!userId) throw new Error('not signed in');
      const current = row ?? { user_id: userId, ...DEFAULT_DIETARY_FLAGS };
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
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  chip: {
    borderWidth: 1,
    borderColor: DesignTokens.color.inkPlaceholder,
    borderRadius: DesignTokens.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: DesignTokens.color.surface.light,
  },
  chipActive: {
    backgroundColor: DesignTokens.color.accent,
    borderColor: DesignTokens.color.accent,
  },
  chipText: { color: DesignTokens.color.inkBody.light },
  chipTextActive: { color: DesignTokens.color.onAccent },
});
