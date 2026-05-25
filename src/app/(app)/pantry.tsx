import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { createSupabaseClient } from '@/lib/supabase';
import {
  addOrUpdatePantryItem,
  deletePantryItem,
  type PantryItem,
  usePantry,
} from '@/lib/use-pantry';
import { usePodStore } from '@/state/usePodStore';

export default function PantryScreen() {
  const activePodId = usePodStore((s) => s.activePodId);
  const { userId, getToken } = useAuth();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const { data, isLoading } = usePantry();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  const addMutation = useMutation({
    mutationFn: () => {
      if (!activePodId || !userId) throw new Error('missing pod or user');
      return addOrUpdatePantryItem(supabase, {
        podId: activePodId,
        updatedByUserId: userId,
        name: name.trim(),
        quantity: parseQuantity(quantity),
        unit: emptyToNull(unit),
      });
    },
    onSuccess: () => {
      setName('');
      setQuantity('');
      setUnit('');
      queryClient.invalidateQueries({ queryKey: ['pantry', activePodId] });
      analytics.capture('pantry_item_added', { source: 'manual' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePantryItem(supabase, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pantry', activePodId] }),
  });

  if (!activePodId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="pantry-empty">
          <ThemedText type="title">Pantry</ThemedText>
          <ThemedText type="small">Pair into a pod to track shared pantry items.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center} testID="pantry-loading">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const items = data ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="title">Pantry</ThemedText>
            <ThemedText type="small">Keep the shared kitchen inventory current.</ThemedText>
          </View>

          <View style={styles.form}>
            <TextInput
              testID="pantry-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Item"
              style={styles.input}
            />
            <View style={styles.formRow}>
              <TextInput
                testID="pantry-quantity-input"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="Qty"
                keyboardType="numeric"
                style={[styles.input, styles.compactInput]}
              />
              <TextInput
                testID="pantry-unit-input"
                value={unit}
                onChangeText={setUnit}
                placeholder="Unit"
                style={[styles.input, styles.compactInput]}
              />
            </View>
            <Pressable
              testID="pantry-add"
              style={[styles.cta, (!name.trim() || addMutation.isPending) && styles.ctaDisabled]}
              disabled={!name.trim() || addMutation.isPending}
              onPress={() => addMutation.mutate()}
            >
              <ThemedText type="small" style={styles.ctaText}>
                Add
              </ThemedText>
            </Pressable>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty} testID="pantry-empty">
              <ThemedText type="subtitle">No pantry items yet</ThemedText>
              <ThemedText type="small">Add what you already have on hand.</ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {items.map((item) => (
                <PantryRow
                  key={item.id}
                  item={item}
                  deleting={deleteMutation.isPending}
                  onDelete={() => deleteMutation.mutate(item.id)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PantryRow({
  item,
  deleting,
  onDelete,
}: {
  item: PantryItem;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <View style={styles.itemRow} testID={`pantry-item-${item.id}`}>
      <View style={styles.itemText}>
        <ThemedText type="smallBold">{item.name}</ThemedText>
        <ThemedText type="small">{formatDetails(item)}</ThemedText>
      </View>
      <Pressable
        testID={`pantry-delete-${item.id}`}
        style={[styles.secondaryCta, deleting && styles.ctaDisabled]}
        disabled={deleting}
        onPress={onDelete}
      >
        <ThemedText type="small" style={styles.secondaryCtaText}>
          Delete
        </ThemedText>
      </Pressable>
    </View>
  );
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDetails(item: PantryItem): string {
  const quantity = formatQuantity(item);
  const expiration = item.expiresAt ? `Expires ${formatDate(item.expiresAt)}` : null;
  return [quantity, expiration].filter((part): part is string => part !== null).join(' · ');
}

function formatQuantity(item: PantryItem): string | null {
  if (item.quantity === null && !item.unit) return null;
  if (item.quantity === null) return item.unit;
  return `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: Spacing.five },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.two },
  form: { gap: Spacing.two },
  formRow: { flexDirection: 'row', gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderColor: DesignTokens.color.borderMuted.light,
    borderRadius: DesignTokens.radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
  compactInput: { flex: 1 },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.bgCard.light,
  },
  secondaryCta: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderStrong.light,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: DesignTokens.color.textOnDark, fontWeight: '600' },
  secondaryCtaText: { color: DesignTokens.color.textPrimary.light, fontWeight: '600' },
  empty: { gap: Spacing.two },
  list: { gap: Spacing.two },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: DesignTokens.color.borderMuted.light,
  },
  itemText: { flex: 1, gap: Spacing.one },
});
