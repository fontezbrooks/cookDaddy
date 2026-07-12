// Root app layout — provider composition for the entire mobile app.
//
// Order matters:
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { PostHogErrorBoundary, PostHogProvider } from 'posthog-react-native';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAnalyticsIdentity } from '@/lib/use-analytics-identity';

type AppExtra = {
  clerkPublishableKey?: string;
  posthogKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

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
  // GestureHandlerRootView must be the outermost view: SwipeDeck's
  // GestureDetector throws on mount without it (RNGH installation contract).
  return (
    <GestureHandlerRootView style={styles.root}>
      <PostHogProvider
        apiKey={posthogKey || 'phc_disabled_local_dev'}
        autocapture={false}
        options={
          posthogKey
            ? {
                errorTracking: {
                  autocapture: { uncaughtExceptions: true, unhandledRejections: true },
                },
              }
            : { disabled: true }
        }
      >
        <PostHogErrorBoundary>{tree}</PostHogErrorBoundary>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

export default RootLayout;
