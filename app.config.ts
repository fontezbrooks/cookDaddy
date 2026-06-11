import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'cookDaddy',
  slug: 'cookdaddy',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'cookdaddy',
  userInterfaceStyle: 'light',
  ios: {
    icon: './assets/expo.icon',
    bundleIdentifier: 'app.cookdaddy.mobile',
    supportsTablet: false,
    // Universal Links — the P5 deep-link handler picks up taps on
    // https://cookdaddy.app/invite/<token> etc. AASA file must be served
    // from https://cookdaddy.app/.well-known/apple-app-site-association.
    associatedDomains: ['applinks:cookdaddy.app'],
  },
  android: {
    package: 'app.cookdaddy.mobile',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        // Universal Links Android counterpart. Verified via
        // /.well-known/assetlinks.json — see docs/DESIGN §8.4.
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'cookdaddy.app' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-notifications',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
