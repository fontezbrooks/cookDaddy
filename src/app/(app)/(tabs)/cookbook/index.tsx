import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { type CookbookEntry, type CookbookFilter, usePodMatches } from '@/lib/use-pod-matches';

type FilterTab = {
  label: string;
  filter: CookbookFilter;
};

const FILTER_TABS: FilterTab[] = [
  { label: 'All', filter: 'all' },
  { label: 'To cook', filter: 'unattempted' },
  { label: 'Cooked', filter: 'cooked' },
  { label: 'Removed', filter: 'removed' },
];

export default function CookbookIndexScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<CookbookFilter>('all');
  const { data, isLoading, error } = usePodMatches(filter);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title">Cookbook</ThemedText>
        <FilterTabs selectedFilter={filter} onSelect={setFilter} />
        <CookbookContent
          entries={data ?? []}
          error={error}
          filter={filter}
          isLoading={isLoading}
          onOpen={(matchId) => router.push(`/cookbook/${matchId}`)}
        />
      </View>
    </SafeAreaView>
  );
}

function FilterTabs({
  selectedFilter,
  onSelect,
}: {
  selectedFilter: CookbookFilter;
  onSelect: (filter: CookbookFilter) => void;
}) {
  return (
    <View style={styles.filterRow}>
      {FILTER_TABS.map((tab) => {
        const active = selectedFilter === tab.filter;
        return (
          <Pressable
            key={tab.filter}
            testID={`cookbook-filter-${tab.filter}`}
            accessibilityRole="button"
            style={[styles.filterTab, active && styles.filterTabActive]}
            onPress={() => onSelect(tab.filter)}
          >
            <ThemedText type="small" style={active ? styles.filterTextActive : styles.filterText}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function CookbookContent({
  entries,
  error,
  filter,
  isLoading,
  onOpen,
}: {
  entries: CookbookEntry[];
  error: Error | null;
  filter: CookbookFilter;
  isLoading: boolean;
  onOpen: (matchId: string) => void;
}) {
  if (isLoading) return <ActivityIndicator testID="cookbook-loading" />;

  if (error) {
    return (
      <ThemedText type="small" testID="cookbook-error">
        Couldn’t load your cookbook. Pull to retry.
      </ThemedText>
    );
  }

  if (entries.length === 0) return <EmptyState filter={filter} />;

  return (
    <View style={styles.grid}>
      {entries.map((entry) => (
        <CookbookTile key={entry.matchId} entry={entry} onOpen={onOpen} />
      ))}
    </View>
  );
}

function EmptyState({ filter }: { filter: CookbookFilter }) {
  const copy =
    filter === 'all' || filter === 'unattempted'
      ? 'No recipes here yet — go swipe with your partner!'
      : 'Nothing in this list yet.';

  return (
    <View testID="cookbook-empty" style={styles.empty}>
      <ThemedText type="small">{copy}</ThemedText>
    </View>
  );
}

function CookbookTile({
  entry,
  onOpen,
}: {
  entry: CookbookEntry;
  onOpen: (matchId: string) => void;
}) {
  return (
    <Pressable
      testID={`cookbook-tile-${entry.matchId}`}
      accessibilityRole="button"
      style={styles.tile}
      onPress={() => onOpen(entry.matchId)}
    >
      <RecipeImage entry={entry} />
      <View style={styles.tileBody}>
        <ThemedText type="small" numberOfLines={2} style={styles.tileTitle}>
          {entry.title}
        </ThemedText>
        {entry.cookedAt ? (
          <ThemedText type="small" style={styles.badge}>
            Cooked
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

function RecipeImage({ entry }: { entry: CookbookEntry }) {
  if (!entry.imageUrl) return <View style={styles.placeholder} />;

  return <Image source={{ uri: entry.imageUrl }} style={styles.image} contentFit="cover" />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filterTab: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.pill,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderMuted.light,
    backgroundColor: DesignTokens.color.surface.light,
  },
  filterTabActive: {
    borderColor: DesignTokens.color.persimmonDeep,
    backgroundColor: DesignTokens.color.persimmonDeep,
  },
  filterText: { color: DesignTokens.color.ink.light, fontWeight: '600' },
  filterTextActive: { color: DesignTokens.color.textOnDark, fontWeight: '700' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  tile: {
    flexBasis: '47%',
    minWidth: 140,
    borderRadius: DesignTokens.radius.md,
    overflow: 'hidden',
    backgroundColor: DesignTokens.color.surface.light,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderMuted.light,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: DesignTokens.color.bgElevated.light,
  },
  placeholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: DesignTokens.color.bgElevated.light,
  },
  tileBody: { padding: Spacing.two, gap: Spacing.two },
  tileTitle: { color: DesignTokens.color.ink.light, fontWeight: '700' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: DesignTokens.space.one,
    borderRadius: DesignTokens.radius.pill,
    overflow: 'hidden',
    color: DesignTokens.color.textOnDark,
    backgroundColor: DesignTokens.color.successDeep,
    fontWeight: '700',
  },
  empty: {
    paddingVertical: Spacing.three,
  },
});
