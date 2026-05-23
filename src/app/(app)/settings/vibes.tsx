// Vibes settings — toggles for haptics / sound / animations land in P8 with
// the match-overlay work. This is a routing-only stub for P4.

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function VibesScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title">Vibes</ThemedText>
        <ThemedText type="small" testID="vibes-stub">
          Haptics, sound, and animation toggles land in P8 (match overlay).
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
});
