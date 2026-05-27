import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
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
  addShoppingItem,
  clearChecked,
  moveToPantry,
  type ShoppingItem,
  toggleChecked,
  useShoppingList,
} from '@/lib/use-shopping-list';
import { usePodStore } from '@/state/usePodStore';

type ShoppingGroup = {
  category: string;
  items: ShoppingItem[];
};

export default function ShoppingScreen() {
  const activePodId = usePodStore((s) => s.activePodId);
  const { userId, getToken } = useAuth();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const { data, isLoading } = useShoppingList();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  const invalidateShopping = () => {
    queryClient.invalidateQueries({ queryKey: ['shopping-list', activePodId] });
  };

  const addMutation = useMutation({
    mutationFn: () => {
      if (!activePodId || !userId) throw new Error('missing pod or user');
      return addShoppingItem(supabase, {
        podId: activePodId,
        addedByUserId: userId,
        name: name.trim(),
        quantity: parseQuantity(quantity),
        unit: emptyToNull(unit),
        category: emptyToNull(category),
      });
    },
    onSuccess: () => {
      setName('');
      setCategory('');
      setQuantity('');
      setUnit('');
      invalidateShopping();
      analytics.capture('shopping_item_added', { source: 'manual', pantry_conflict: false });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (item: ShoppingItem) => toggleChecked(supabase, item),
    onSuccess: invalidateShopping,
  });

  const clearMutation = useMutation({
    mutationFn: () => {
      if (!activePodId) throw new Error('missing pod');
      return clearChecked(supabase, activePodId);
    },
    onSuccess: invalidateShopping,
  });

  const moveMutation = useMutation({
    mutationFn: (item: ShoppingItem) => {
      if (!activePodId || !userId) throw new Error('missing pod or user');
      return moveToPantry(supabase, {
        podId: activePodId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        updatedByUserId: userId,
        shoppingItemId: item.id,
      });
    },
    onSuccess: () => {
      invalidateShopping();
      queryClient.invalidateQueries({ queryKey: ['pantry', activePodId] });
      analytics.capture('pantry_item_added', { source: 'shopping_move' });
    },
  });

  if (!activePodId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="shopping-empty">
          <ThemedText type="title">Shopping</ThemedText>
          <ThemedText type="small">Pair into a pod to share a shopping list.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center} testID="shopping-loading">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const items = data ?? [];
  const checkedCount = items.filter((item) => item.checkedAt !== null).length;
  const groups = groupShoppingItems(items);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <ThemedText type="title">Shopping</ThemedText>
              <ThemedText type="small">Shared list for the pod.</ThemedText>
            </View>
            <Link href="/pantry" testID="shopping-open-pantry">
              <ThemedText type="small">Pantry</ThemedText>
            </Link>
          </View>

          <View style={styles.form}>
            <TextInput
              testID="shopping-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Item"
              style={styles.input}
            />
            <TextInput
              testID="shopping-category-input"
              value={category}
              onChangeText={setCategory}
              placeholder="Category"
              style={styles.input}
            />
            <View style={styles.formRow}>
              <TextInput
                testID="shopping-quantity-input"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="Qty"
                keyboardType="numeric"
                style={[styles.input, styles.compactInput]}
              />
              <TextInput
                testID="shopping-unit-input"
                value={unit}
                onChangeText={setUnit}
                placeholder="Unit"
                style={[styles.input, styles.compactInput]}
              />
            </View>
            <Pressable
              testID="shopping-add"
              style={[styles.cta, (!name.trim() || addMutation.isPending) && styles.ctaDisabled]}
              disabled={!name.trim() || addMutation.isPending}
              onPress={() => addMutation.mutate()}
            >
              <ThemedText type="small" style={styles.ctaText}>
                Add
              </ThemedText>
            </Pressable>
          </View>

          {checkedCount > 0 ? (
            <Pressable
              testID="shopping-clear-checked"
              style={[styles.secondaryCta, clearMutation.isPending && styles.ctaDisabled]}
              disabled={clearMutation.isPending}
              onPress={() => clearMutation.mutate()}
            >
              <ThemedText type="small" style={styles.secondaryCtaText}>
                Clear checked
              </ThemedText>
            </Pressable>
          ) : null}

          {items.length === 0 ? (
            <View style={styles.empty} testID="shopping-empty">
              <ThemedText type="subtitle">Nothing to buy</ThemedText>
              <ThemedText type="small">Add an item when the kitchen runs low.</ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {groups.map((group) => (
                <View key={group.category} style={styles.group}>
                  <ThemedText type="subtitle">{group.category}</ThemedText>
                  {group.items.map((item) => (
                    <ShoppingRow
                      key={item.id}
                      item={item}
                      busy={toggleMutation.isPending || moveMutation.isPending}
                      onToggle={() => toggleMutation.mutate(item)}
                      onMove={() => moveMutation.mutate(item)}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ShoppingRow({
  item,
  busy,
  onToggle,
  onMove,
}: {
  item: ShoppingItem;
  busy: boolean;
  onToggle: () => void;
  onMove: () => void;
}) {
  const checked = item.checkedAt !== null;
  return (
    <View
      style={[styles.itemRow, checked && styles.itemRowChecked]}
      testID={`shopping-item-${item.id}`}
    >
      <Pressable
        testID={`shopping-check-${item.id}`}
        style={styles.check}
        disabled={busy}
        onPress={onToggle}
      >
        <ThemedText type="small" style={styles.checkText}>
          {checked ? '✓' : ''}
        </ThemedText>
      </Pressable>
      <View style={styles.itemText}>
        <ThemedText type="smallBold" style={checked && styles.checkedText}>
          {item.name}
        </ThemedText>
        <ThemedText type="small">{formatQuantity(item)}</ThemedText>
      </View>
      {checked ? (
        <Pressable
          testID={`shopping-move-${item.id}`}
          style={[styles.secondaryCta, busy && styles.ctaDisabled]}
          disabled={busy}
          onPress={onMove}
        >
          <ThemedText type="small" style={styles.secondaryCtaText}>
            Move to pantry
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function groupShoppingItems(items: ShoppingItem[]): ShoppingGroup[] {
  const groups = new Map<string, ShoppingItem[]>();
  items.forEach((item) => {
    const category = item.category?.trim() || 'Other';
    groups.set(category, [...(groups.get(category) ?? []), item]);
  });
  return Array.from(groups, ([category, groupItems]) => ({ category, items: groupItems }));
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

function formatQuantity(item: ShoppingItem): string {
  if (item.quantity === null && !item.unit) return '';
  if (item.quantity === null) return item.unit ?? '';
  return `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: Spacing.five },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerText: { flex: 1, gap: Spacing.two },
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
  list: { gap: Spacing.four },
  group: { gap: Spacing.two },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: DesignTokens.color.borderMuted.light,
  },
  itemRowChecked: { opacity: 0.65 },
  check: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DesignTokens.radius.pill,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderStrong.light,
  },
  checkText: { fontWeight: '700' },
  itemText: { flex: 1, gap: Spacing.one },
  checkedText: { textDecorationLine: 'line-through' },
});
