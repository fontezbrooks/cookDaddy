// Invite token deep-link target — full consume_pod_invite flow lands in P5.

import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function InviteTokenScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title">Invite</ThemedText>
        <ThemedText type="small" testID="invite-stub">
          Token: {token ?? '(none)'}. Pod consume flow lands in P5.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
});
