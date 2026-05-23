// Protected app layout per WORKFLOW §7. Gates the entire (app) tree behind
// a Clerk session. The Supabase client is constructed once per layout instance
// via the Clerk getToken adapter (DESIGN §4) and exposed to descendants by
// the useSupabase() hook (built in P5 — for P4 the home/profile/dietary
// screens use the factory directly).

import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { usePodSync } from '@/lib/use-pod-sync';

export default function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  // Keep usePodStore reconciled with the server's pod_members truth so
  // partner-removed-me transitions surface on foreground (DESIGN §16.1).
  // Safe to call before the early returns because the hook is a no-op when
  // there's no session.
  usePodSync();

  if (!isLoaded) {
    return (
      <View style={styles.center} testID="protected-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
