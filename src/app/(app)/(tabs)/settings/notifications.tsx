import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { type NotificationPrefKey, useNotificationPrefs } from '@/lib/use-notification-prefs';

type Row = {
  testID: string;
  label: string;
  description: string;
  value: boolean;
  prefKey: NotificationPrefKey;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { prefs, isLoading, setPref } = useNotificationPrefs();

  const rows: Row[] = [
    {
      testID: 'notifications-match',
      label: 'Matches',
      description: 'When you and your partner match on a recipe.',
      value: prefs.matchEnabled,
      prefKey: 'matchEnabled',
    },
    {
      testID: 'notifications-session',
      label: 'Session invites',
      description: 'When your partner starts a swipe session.',
      value: prefs.sessionInviteEnabled,
      prefKey: 'sessionInviteEnabled',
    },
    {
      testID: 'notifications-pod',
      label: 'Pod updates',
      description: 'When someone joins your pod.',
      value: prefs.podJoinedEnabled,
      prefKey: 'podJoinedEnabled',
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <AppBar title="Notifications" onBack={() => router.back()} />
        <ThemedText type="small">Choose what you hear about.</ThemedText>

        {isLoading ? (
          <ActivityIndicator testID="notifications-loading" />
        ) : (
          <View style={styles.rows}>
            {rows.map((row) => (
              <Pressable
                key={row.testID}
                testID={row.testID}
                accessibilityRole="switch"
                accessibilityState={{ checked: row.value }}
                accessibilityLabel={row.label}
                onPress={() => setPref(row.prefKey, !row.value)}
                style={styles.row}
              >
                <View style={styles.rowText}>
                  <ThemedText type="default">{row.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.description}
                  </ThemedText>
                </View>
                <Switch
                  value={row.value}
                  onValueChange={(value) => setPref(row.prefKey, value)}
                  accessibilityLabel={`${row.label} toggle`}
                  trackColor={{
                    false: DesignTokens.color.inkPlaceholder,
                    true: DesignTokens.color.accent,
                  }}
                  thumbColor={
                    row.value ? DesignTokens.color.accent : DesignTokens.color.surface.light
                  }
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  rows: { marginTop: Spacing.three, gap: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DesignTokens.color.surface.light,
    borderRadius: DesignTokens.radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    ...DesignTokens.elevation.card,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
