import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

const SETTINGS_LINKS = [
  { href: '/settings/profile', label: 'Profile', testID: 'settings-link-profile' },
  { href: '/settings/dietary', label: 'Dietary', testID: 'settings-link-dietary' },
  { href: '/settings/vibes', label: 'Vibes', testID: 'settings-link-vibes' },
  {
    href: '/settings/notifications',
    label: 'Notifications',
    testID: 'settings-link-notifications',
  },
  { href: '/settings/pod', label: 'Pod', testID: 'settings-link-pod' },
] as const;

export default function SettingsHubScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container} testID="settings-hub">
        <ThemedText type="title">Settings</ThemedText>
        <View style={styles.links}>
          {SETTINGS_LINKS.map((item) => (
            <Link key={item.href} href={item.href} testID={item.testID} style={styles.link}>
              <ThemedText type="smallBold">{item.label}</ThemedText>
            </Link>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  links: {
    gap: Spacing.two,
  },
  link: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: DesignTokens.color.borderMuted.light,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.surface.light,
  },
});
