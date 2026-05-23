// Cookbook detail — recipe view + cook log lands in P9.

import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function CookbookDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title">Match</ThemedText>
        <ThemedText type="small" testID="cookbook-detail-stub">
          Match id: {matchId ?? '(none)'}. Recipe view + notes land in P9.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
});
