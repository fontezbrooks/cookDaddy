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
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
} from '@expo-google-fonts/be-vietnam-pro';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useAnalyticsIdentity } from '@/lib/use-analytics-identity';

type AppExtra = {
  clerkPublishableKey?: string;
  sentryDsn?: string;
  posthogKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

// Sentry must init at module load so it captures errors during the provider
// tree's first render, and so Sentry.wrap() below has an initialized client.
// DSN is optional — with no DSN (local dev / CI) enabled:false keeps it inert.
Sentry.init({
  dsn: extra.sentryDsn,
  enabled: !!extra.sentryDsn,
  enableAutoSessionTracking: true,
  debug: __DEV__,
});

SplashScreen.preventAutoHideAsync();

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
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });
  const colorScheme = useColorScheme();
  const publishableKey = extra.clerkPublishableKey ?? '';
  const posthogKey = extra.posthogKey;

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

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

  // Always mount PostHogProvider so the analytics hooks (usePostHog /
  // useFeatureFlag) always find a client in context. Without a key (local dev /
  // CI) the provider is mounted with a non-empty placeholder key and
  // disabled: true, making the client fully inert (no network, no capture).
  // The placeholder key matters: an empty key makes the SDK log
  // "You must pass your PostHog project's api key" — the exact boot-time
  // console.error this clean-boot change exists to remove.
  return (
    <PostHogProvider
      apiKey={posthogKey || 'phc_disabled_local_dev'}
      autocapture={false}
      options={posthogKey ? undefined : { disabled: true }}
    >
      {tree}
    </PostHogProvider>
  );
}

export default Sentry.wrap(RootLayout);
