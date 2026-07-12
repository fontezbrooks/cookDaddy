import { Stack } from 'expo-router';

// Anchor the stack so deep links to child screens (e.g. Home → /settings/
// profile) mount the hub beneath them — without this the tab is stranded on
// the child with nothing to pop (docs/POD-READ-PATH/README.md FR-5).
export const unstable_settings = { initialRouteName: 'index' };

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
