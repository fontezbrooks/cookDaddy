import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Colors, Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { type FridgeGroup, useFridge } from '@/lib/use-fridge';
import { type PantryItem } from '@/lib/use-pantry';
import { useReducedMotion } from '@/lib/use-reduced-motion';

type FridgeSection = {
  title: string;
  data: PantryItem[];
};

export default function FridgeScreen() {
  const { groups, isLoading } = useFridge();
  const reducedMotion = useReducedMotion();
  const analytics = useAnalytics();
  const capturedRef = useRef(false);

  const itemCount = useMemo(
    () => groups.reduce((total, group) => total + group.items.length, 0),
    [groups],
  );
  const sections = useMemo(() => toSections(groups), [groups]);

  useEffect(() => {
    if (isLoading || capturedRef.current) return;
    capturedRef.current = true;
    analytics.capture('fridge_viewed', {
      item_count: itemCount,
      aisle_count: groups.length,
    });
  }, [analytics, groups.length, isLoading, itemCount]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="title">Fridge</ThemedText>
            <ThemedText type="small">Shared pantry items by aisle.</ThemedText>
          </View>
          <Pressable
            testID="fridge-edit"
            style={styles.editButton}
            onPress={() => router.push('/pantry')}
          >
            <ThemedText type="small" style={styles.editButtonText}>
              Edit
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.revealFrame}>
          {isLoading ? (
            <View testID="fridge-loading" style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : itemCount === 0 ? (
            <View testID="fridge-empty" style={styles.empty}>
              <ThemedText type="subtitle">No pantry items yet</ThemedText>
              <ThemedText type="small">Add items from Pantry to see them grouped here.</ThemedText>
            </View>
          ) : (
            <RevealedContent reducedMotion={reducedMotion}>
              <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderSectionHeader={({ section }) => (
                  <View testID={`fridge-aisle-${section.title}`} style={styles.sectionHeader}>
                    <ThemedText type="smallBold">{section.title}</ThemedText>
                  </View>
                )}
                renderItem={({ item }) => <FridgeRow item={item} />}
              />
            </RevealedContent>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function RevealedContent({
  children,
  reducedMotion,
}: {
  children: React.ReactNode;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: reducedMotion ? 250 : 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reducedMotion]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const leftDoorStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0 : 1 - progress.value,
    transform: [{ translateX: reducedMotion ? 0 : -140 * progress.value }],
  }));
  const rightDoorStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0 : 1 - progress.value,
    transform: [{ translateX: reducedMotion ? 0 : 140 * progress.value }],
  }));

  return (
    <View style={styles.revealContent}>
      <Animated.View style={[styles.content, contentStyle]}>{children}</Animated.View>
      {!reducedMotion ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.door, styles.leftDoor, leftDoorStyle]} />
          <Animated.View style={[styles.door, styles.rightDoor, rightDoorStyle]} />
        </View>
      ) : null}
    </View>
  );
}

function FridgeRow({ item }: { item: PantryItem }) {
  return (
    <View testID={`fridge-item-${item.id}`} style={styles.itemRow}>
      <ThemedText type="smallBold">{item.name}</ThemedText>
      <ThemedText type="small">{formatQuantity(item)}</ThemedText>
    </View>
  );
}

function toSections(groups: FridgeGroup[]): FridgeSection[] {
  return groups.map((group) => ({ title: group.aisle, data: group.items }));
}

function formatQuantity(item: PantryItem): string {
  if (item.quantity === null && !item.unit) return 'On hand';
  if (item.quantity === null) return item.unit ?? 'On hand';
  return `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerText: { flex: 1, gap: Spacing.two },
  editButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.bgCard.light,
  },
  editButtonText: { color: DesignTokens.color.textOnDark, fontWeight: '600' },
  revealFrame: { flex: 1 },
  revealContent: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, justifyContent: 'center', gap: Spacing.two },
  listContent: { paddingBottom: Spacing.five },
  sectionHeader: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    backgroundColor: Colors.light.background,
  },
  itemRow: {
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: DesignTokens.color.borderMuted.light,
  },
  door: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: Colors.light.backgroundElement,
    borderColor: DesignTokens.color.borderMuted.light,
  },
  leftDoor: { left: 0, borderRightWidth: 1 },
  rightDoor: { right: 0, borderLeftWidth: 1 },
});
