import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { createSupabaseClient } from '@/lib/supabase';
import { useMatchDetail } from '@/lib/use-match-detail';
import { markCooked, removeFromCookbook } from '@/lib/use-pod-matches';

export default function CookbookDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const { data, isLoading, error } = useMatchDetail(matchId);

  const markCookedMutation = useMutation({
    mutationFn: () => markCooked(supabase, matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-detail', matchId] });
      queryClient.invalidateQueries({ queryKey: ['pod-matches'] });
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
          <Pressable
            testID="cookbook-detail-back-home"
            style={styles.cta}
            onPress={() => router.replace('/home')}
          >
            <ThemedText type="small" style={styles.ctaText}>
              Back to home
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const meta = [data.readyInMinutes ? `${data.readyInMinutes} min` : null, servingsLabel(data)]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const cooked = data.cookedAt !== null;

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

          <View style={styles.actions}>
            <Pressable
              testID="cookbook-mark-cooked"
              style={[styles.cta, cooked && styles.ctaDisabled]}
              disabled={cooked || markCookedMutation.isPending}
              onPress={() => markCookedMutation.mutate()}
            >
              <ThemedText type="small" style={styles.ctaText}>
                {cooked ? 'Cooked ✓' : 'Mark cooked'}
              </ThemedText>
            </Pressable>

            <Pressable
              testID="cookbook-remove"
              style={[styles.secondaryCta, removeMutation.isPending && styles.ctaDisabled]}
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
                style={[styles.secondaryCta, styles.ctaDisabled]}
                disabled
              >
                <ThemedText type="small" style={styles.secondaryCtaText}>
                  Add to shopping list
                </ThemedText>
              </Pressable>
              <ThemedText type="small">Coming soon</ThemedText>
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  actions: { gap: Spacing.three, paddingTop: Spacing.two },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.bgCard.light,
  },
  secondaryCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderStrong.light,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: DesignTokens.color.textOnDark, fontWeight: '600' },
  secondaryCtaText: { color: DesignTokens.color.textPrimary.light, fontWeight: '600' },
  shoppingGroup: { gap: Spacing.one },
});
