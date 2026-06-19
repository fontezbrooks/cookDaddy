import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { createSupabaseClient } from '@/lib/supabase';
import { useMatchDetail } from '@/lib/use-match-detail';
import { markCooked, removeFromCookbook } from '@/lib/use-pod-matches';
import { addShoppingItemsFromRecipe } from '@/lib/use-shopping-list';
import { usePodStore } from '@/state/usePodStore';

export default function CookbookDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const podId = usePodStore((s) => s.activePodId);
  const [shoppingResult, setShoppingResult] = useState<{
    inserted: number;
    conflicts: string[];
  } | null>(null);
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const { data, isLoading, error } = useMatchDetail(matchId);

  const markCookedMutation = useMutation({
    mutationFn: () => markCooked(supabase, matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-detail', matchId] });
      queryClient.invalidateQueries({ queryKey: ['pod-matches'] });
      if (data) {
        analytics.capture('recipe_cooked_marked', {
          match_id: matchId,
          recipe_id: data.recipeId,
          time_since_match_h: (Date.now() - new Date(data.matchedAt).getTime()) / 3_600_000,
        });
      }
      haptics.notificationSuccess();
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeFromCookbook(supabase, matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pod-matches'] });
      router.back();
    },
  });

  const addShoppingMutation = useMutation({
    mutationFn: async () => {
      if (!podId || !data) throw new Error('Missing pod or recipe');
      return addShoppingItemsFromRecipe(supabase, {
        podId,
        recipeId: data.recipeId,
        ingredientIds: data.ingredients.map((ingredient) => ingredient.id),
      });
    },
    onSuccess: (result) => {
      setShoppingResult({ inserted: result.insertedCount, conflicts: result.pantryConflicts });
      queryClient.invalidateQueries({ queryKey: ['shopping-list', podId] });
      analytics.capture('shopping_item_added', {
        source: 'recipe',
        pantry_conflict: result.pantryConflicts.length > 0,
      });
      haptics.notificationSuccess();
    },
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center} testID="cookbook-detail-loading">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <ThemedText type="title">Recipe unavailable</ThemedText>
          <ThemedText type="small" testID="cookbook-detail-error">
            Couldn’t load this recipe. Please try again.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container} testID="cookbook-detail-not-found">
          <ThemedText type="title">Recipe not found</ThemedText>
          <ThemedText type="small">It may have been removed or you don’t have access.</ThemedText>
          <PrimaryButton
            testID="cookbook-detail-back-home"
            onPress={() => router.replace('/home')}
            title="Back to home"
          />
        </View>
      </SafeAreaView>
    );
  }

  const meta = [data.readyInMinutes ? `${data.readyInMinutes} min` : null, servingsLabel(data)]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const cooked = data.cookedAt !== null;
  const steps = data.instructionSteps ?? [];
  const nutrients = data.nutrients ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {data.imageUrl ? (
          <Image source={{ uri: data.imageUrl }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]} />
        )}

        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="title">{data.title}</ThemedText>
            {meta ? <ThemedText type="small">{meta}</ThemedText> : null}
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle">Ingredients</ThemedText>
            <View style={styles.ingredients}>
              {data.ingredients.map((ingredient) => (
                <ThemedText key={ingredient.id} type="small" testID={`ingredient-${ingredient.id}`}>
                  {ingredient.originalText ?? ingredient.name}
                </ThemedText>
              ))}
            </View>
          </View>

          {steps.length > 0 ? (
            <View style={styles.section} testID="cooking-steps">
              <ThemedText type="subtitle">Steps</ThemedText>
              <View style={styles.steps}>
                {steps.map((step, index) => (
                  <ThemedText
                    key={`${step.stepNumber}-${index}`}
                    type="small"
                    testID={`step-${index}`}
                  >
                    {formatStep(step)}
                  </ThemedText>
                ))}
              </View>
            </View>
          ) : null}

          {nutrients.length > 0 ? (
            <View style={styles.section} testID="nutrition-panel">
              <ThemedText type="subtitle">Nutrition</ThemedText>
              <View style={styles.nutrients}>
                {nutrients.map((nutrient, index) => (
                  <View
                    key={`${nutrient.name}-${index}`}
                    style={styles.nutrientRow}
                    testID={`nutrient-${index}`}
                  >
                    <ThemedText type="small">{nutrient.name}</ThemedText>
                    <ThemedText type="small">{formatNutrientValue(nutrient)}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              testID="cookbook-mark-cooked"
              disabled={cooked || markCookedMutation.isPending}
              onPress={() => markCookedMutation.mutate()}
              title={cooked ? 'Cooked ✓' : 'Mark cooked'}
            />

            <Pressable
              testID="cookbook-remove"
              style={[styles.secondaryCta, removeMutation.isPending && styles.disabled]}
              disabled={removeMutation.isPending}
              onPress={() => removeMutation.mutate()}
            >
              <ThemedText type="small" style={styles.secondaryCtaText}>
                Remove from cookbook
              </ThemedText>
            </Pressable>

            <View style={styles.shoppingGroup}>
              <Pressable
                testID="cookbook-add-shopping"
                style={[
                  styles.secondaryCta,
                  (!podId || addShoppingMutation.isPending || shoppingResult !== null) &&
                    styles.disabled,
                ]}
                disabled={!podId || addShoppingMutation.isPending || shoppingResult !== null}
                onPress={() => addShoppingMutation.mutate()}
              >
                <ThemedText type="small" style={styles.secondaryCtaText}>
                  {shoppingResult === null ? 'Add to shopping list' : 'Added ✓'}
                </ThemedText>
              </Pressable>
              {shoppingResult === null ? null : (
                <ThemedText type="small" testID="cookbook-shopping-status">
                  {shoppingResult.conflicts.length > 0
                    ? `Added ${shoppingResult.inserted} · already in pantry: ${shoppingResult.conflicts.join(', ')}`
                    : `Added ${shoppingResult.inserted} to shopping list`}
                </ThemedText>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function servingsLabel(data: { servings: number | null }): string | null {
  if (data.servings === null) return null;
  return `${data.servings} ${data.servings === 1 ? 'serving' : 'servings'}`;
}

function formatAmount(n: number | null): string {
  if (n === null) return '—';
  return String(Math.round(n * 10) / 10);
}

function formatStep(step: {
  stepNumber: number;
  text: string;
  lengthNumber: number | null;
  lengthUnit: string | null;
}): string {
  const length =
    step.lengthNumber !== null && step.lengthUnit
      ? ` (${step.lengthNumber} ${step.lengthUnit})`
      : '';
  return `${step.stepNumber}. ${step.text}${length}`;
}

function formatNutrientValue(nutrient: {
  amount: number | null;
  unit: string | null;
  percentOfDailyNeeds: number | null;
}): string {
  const value = `${formatAmount(nutrient.amount)}${nutrient.unit ? ` ${nutrient.unit}` : ''}`;
  if (nutrient.percentOfDailyNeeds === null) return value;
  return `${value} · ${Math.round(nutrient.percentOfDailyNeeds)}%`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: Spacing.five },
  hero: {
    width: '100%',
    height: 280,
    backgroundColor: DesignTokens.color.bgElevated.light,
  },
  heroPlaceholder: {
    borderBottomWidth: 1,
    borderBottomColor: DesignTokens.color.borderMuted.light,
  },
  content: { padding: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.two },
  section: { gap: Spacing.three },
  ingredients: { gap: Spacing.two },
  steps: { gap: Spacing.two },
  nutrients: { gap: Spacing.two },
  nutrientRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  actions: { gap: Spacing.three, paddingTop: Spacing.two },
  secondaryCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderStrong.light,
  },
  disabled: { opacity: 0.6 },
  secondaryCtaText: { color: DesignTokens.color.ink.light, fontWeight: '600' },
  shoppingGroup: { gap: Spacing.one },
});
