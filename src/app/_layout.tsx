// Root app layout — provider composition for the entire mobile app.
//
// Order matters:
//   • Sentry.init runs at module load so errors during provider boot are caught.
//   • ClerkProvider owns identity; nothing below it can use useAuth/useUser
//     until Clerk hydrates from its token cache (expo-secure-store).
//   • QueryClientProvider wraps below Clerk so queries can read the Clerk
//     session via the Supabase client factory in (app)/_layout.tsx.
//   • PostHogProvider follows so `identify(clerkUserId)` calls in (app)/_layout
//     have a client to attach to.
//   • ThemeProvider + Stack are presentation — innermost.

import { ClerkProvider } from '@clerk/clerk-expo';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'react-native';
import { PostHogProvider } from 'posthog-react-native';

import { useAnalyticsIdentity } from '@/lib/use-analytics-identity';

type AppExtra = {
  clerkPublishableKey?: string;
  sentryDsn?: string;
  posthogKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

// Sentry must init at module load so it captures errors during the provider
// tree's first render. DSN is optional — local dev / CI run without one.
if (extra.sentryDsn) {
  Sentry.init({
    dsn: extra.sentryDsn,
    enableAutoSessionTracking: true,
    debug: __DEV__,
  });
}

// Clerk's token cache: Clerk's session JWT is stored in expo-secure-store
// (Keychain on iOS, EncryptedSharedPreferences on Android) so sign-in survives
// app restarts without leaking the token through AsyncStorage.
const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

// One QueryClient for the app lifetime. Per-route staleTime is set on the
// useQuery call sites.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cold-start cache stays fresh for 60s by default; routes that need
      // stricter freshness (e.g. session lobby presence) override this.
      staleTime: 60_000,
      retry: 2,
    },
  },
});

function AnalyticsIdentity() {
  useAnalyticsIdentity();
  return null;
}

function RootLayout() {
  const colorScheme = useColorScheme();
  const publishableKey = extra.clerkPublishableKey ?? '';
  const posthogKey = extra.posthogKey;

  const tree = (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <AnalyticsIdentity />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );

  // PostHog is optional in local dev / CI; gate on key so tests don't need
  // the provider in their tree.
  if (posthogKey) {
    return (
      <PostHogProvider apiKey={posthogKey} autocapture={false}>
        {tree}
      </PostHogProvider>
    );
  }
  return tree;
}

export default Sentry.wrap(RootLayout);
