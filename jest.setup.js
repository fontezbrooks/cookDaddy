const matchers = require('@testing-library/react-native/matchers');
expect.extend(matchers);

// Sentry's native module isn't available in Jest; stub init and wrap so the
// root layout module can be imported without crashing.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component) => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  // P8 Slice 6: MatchOverlay uses startInactiveSpan to mark its mount
  // window for the §11 ≤100ms first-frame perf budget. The mock returns
  // an object whose .end() is a jest.fn() so tests can assert that the
  // span is closed when the overlay unmounts.
  startInactiveSpan: jest.fn(() => ({ end: jest.fn() })),
  startSpan: jest.fn((_ctx, fn) => fn({ end: jest.fn() })),
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(),
  isLoaded: () => true,
}));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('@expo-google-fonts/space-grotesk', () => ({
  SpaceGrotesk_600SemiBold: 'SpaceGrotesk_600SemiBold',
  SpaceGrotesk_700Bold: 'SpaceGrotesk_700Bold',
}));
jest.mock('@expo-google-fonts/inter', () => ({
  Inter_400Regular: 'Inter_400Regular',
  Inter_500Medium: 'Inter_500Medium',
  Inter_600SemiBold: 'Inter_600SemiBold',
  Inter_700Bold: 'Inter_700Bold',
}));
jest.mock('@expo-google-fonts/jetbrains-mono', () => ({
  JetBrainsMono_500Medium: 'JetBrainsMono_500Medium',
}));

// PostHog requires Async/storage and event flushing — stub the provider so
// trees that include it render synchronously in tests.
jest.mock('posthog-react-native', () => {
  const React = require('react');
  const noop = () => undefined;
  const fakeClient = {
    identify: noop,
    capture: noop,
    reset: noop,
    group: noop,
  };
  return {
    PostHogProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    PostHog: jest.fn().mockImplementation(() => fakeClient),
    usePostHog: () => fakeClient,
  };
});

// @clerk/clerk-expo pulls in native auth machinery; stub the surface our
// components touch (ClerkProvider, SignIn, useAuth, useUser, useSignIn).
// Per-test overrides via `jest.mocked(useAuth).mockReturnValue(...)`.
jest.mock('@clerk/clerk-expo', () => {
  const React = require('react');
  return {
    ClerkProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    ClerkLoaded: ({ children }) => React.createElement(React.Fragment, null, children),
    SignedIn: ({ children }) => React.createElement(React.Fragment, null, children),
    SignedOut: ({ children }) => React.createElement(React.Fragment, null, children),
    useAuth: jest.fn(() => ({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: jest.fn().mockResolvedValue(null),
      signOut: jest.fn().mockResolvedValue(undefined),
    })),
    useUser: jest.fn(() => ({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    })),
    useSignIn: jest.fn(() => ({
      isLoaded: true,
      signIn: {
        create: jest.fn(),
        authenticateWithRedirect: jest.fn(),
      },
      setActive: jest.fn(),
    })),
    useSignUp: jest.fn(() => ({
      isLoaded: true,
      signUp: {
        create: jest.fn(),
        prepareEmailAddressVerification: jest.fn(),
        attemptEmailAddressVerification: jest.fn(),
      },
      setActive: jest.fn(),
    })),
    useOAuth: jest.fn(() => ({
      startOAuthFlow: jest.fn().mockResolvedValue({ createdSessionId: null, setActive: jest.fn() }),
    })),
  };
});

// react-native-reanimated 4 + react-native-worklets fail to initialize under
// Jest (native module check on require). Their shipped /mock entry still
// imports the worklets initializer, so we hand-roll a minimal mock with just
// the surface SwipeDeck (and any future Animated consumer) needs. Worklets
// become plain JS functions; shared values are read/write objects; Animated
// primitives are plain Views.
jest.mock('react-native-worklets', () => ({
  WorkletsModule: {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  createWorkletRuntime: () => ({}),
  isWorkletFunction: () => false,
}));
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const useSharedValue = (initial) => ({ value: initial });
  const useAnimatedStyle = (fn) => {
    try {
      return fn() || {};
    } catch {
      return {};
    }
  };
  // Confetti (P8 Slice 2) uses useDerivedValue per particle. Return a
  // plain shared-value-shaped object whose `.value` is the closure's
  // current result — production code only reads the value, never sets it.
  const useDerivedValue = (fn) => {
    try {
      return { value: fn() };
    } catch {
      return { value: 0 };
    }
  };
  const withSpring = (v) => v;
  const withTiming = (v) => v;
  const withDelay = (_d, v) => v;
  const withRepeat = (v) => v;
  const withSequence = (...vals) => vals[vals.length - 1];
  const runOnJS = (fn) => fn;
  const runOnUI = (fn) => fn;
  const interpolate = (v) => v;
  const AnimatedView = React.forwardRef(function AnimatedView(props, ref) {
    return React.createElement(View, { ref, ...props });
  });
  const Animated = {
    View: AnimatedView,
    Text: View,
    ScrollView: View,
    Image: View,
    createAnimatedComponent: (Comp) => Comp,
  };
  return {
    __esModule: true,
    default: Animated,
    useSharedValue,
    useAnimatedStyle,
    useDerivedValue,
    withSpring,
    withTiming,
    withDelay,
    withRepeat,
    withSequence,
    runOnJS,
    runOnUI,
    interpolate,
    Easing: {
      bezier: () => () => 0,
      linear: () => 0,
      // Slice 5 ken-burns: easing curves drive the 6s/8s scale + translate
      // cycles. The mock only needs the API surface — Reanimated under
      // Jest never actually paints — so each curve is a stub function.
      inOut: () => () => 0,
      in: () => () => 0,
      out: () => () => 0,
      quad: () => 0,
      ease: () => 0,
    },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  };
});

// react-native-gesture-handler has no Jest preset; stub the surface SwipeDeck
// touches so GestureDetector renders its children as-is. The gesture commit
// path is covered indirectly via the accessibility Like/Dislike buttons.
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeGesture = () => {
    const api = {
      onChange: () => api,
      onUpdate: () => api,
      onBegin: () => api,
      onStart: () => api,
      onEnd: () => api,
      onFinalize: () => api,
      enabled: () => api,
      activeOffsetX: () => api,
      failOffsetY: () => api,
      minDistance: () => api,
      maxPointers: () => api,
      simultaneousWithExternalGesture: () => api,
    };
    return api;
  };
  return {
    Gesture: { Pan: makeGesture, Tap: makeGesture, LongPress: makeGesture },
    GestureDetector: ({ children }) => React.createElement(React.Fragment, null, children),
    GestureHandlerRootView: ({ children }) => React.createElement(View, null, children),
    PanGestureHandler: ({ children }) => React.createElement(React.Fragment, null, children),
    TapGestureHandler: ({ children }) => React.createElement(React.Fragment, null, children),
    State: {},
    Directions: {},
  };
});

// expo-haptics ships an in-process JS surface but its native module check
// will throw under Jest. Stub the few API surfaces SwipeDeck + MatchOverlay
// touch. Tests assert these are CALLED — the wrapper at @/lib/haptics owns
// the should-fire-or-not decision based on useSettingsStore.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// @shopify/react-native-skia ships a native module that fails to initialize
// under Jest. Stub the surface the Confetti component touches: Canvas/Group/
// Circle/Rect/Path as plain Views (so testID still resolves), plus a
// minimal Skia namespace whose Path.MakeFromSVGString + Matrix().scale()
// chain return placeholder objects so the heart-path construction doesn't
// throw. The mock is intentionally thin — confetti animation is GPU work
// that can't be meaningfully verified in JSDOM.
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const SkiaView = React.forwardRef(function SkiaView(props, ref) {
    return React.createElement(View, { ref, ...props });
  });
  const passthroughNull = () => null;
  const matrix = () => {
    const m = {
      scale: () => m,
      translate: () => m,
      rotate: () => m,
    };
    return m;
  };
  return {
    Canvas: SkiaView,
    Group: SkiaView,
    Circle: passthroughNull,
    Rect: passthroughNull,
    Path: passthroughNull,
    Skia: {
      Path: {
        MakeFromSVGString: () => ({ transform: () => null }),
      },
      Matrix: matrix,
    },
  };
});

// expo-audio (P8 Slice 3). Production reads useSettingsStore.soundsEnabled
// then calls createAudioPlayer() and player.play(). The mock returns a
// player whose play/seekTo/pause are jest.fn()s so tests can assert call
// counts. createAudioPlayer is also a jest.fn() so tests can verify that
// a sound was loaded with the expected source.
jest.mock('expo-audio', () => {
  const players = [];
  const createAudioPlayer = jest.fn((source) => {
    const player = {
      source,
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(),
      release: jest.fn(),
    };
    players.push(player);
    return player;
  });
  return {
    createAudioPlayer,
    __getCreatedPlayers: () => players,
    __resetMockPlayers: () => {
      players.length = 0;
      createAudioPlayer.mockClear();
    },
  };
});

// expo-secure-store is the backing for Clerk's token cache. Tests don't touch
// the keychain; provide an in-memory shim.
jest.mock('expo-secure-store', () => {
  const memory = new Map();
  return {
    getItemAsync: jest.fn((key) => Promise.resolve(memory.get(key) ?? null)),
    setItemAsync: jest.fn((key, value) => {
      memory.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key) => {
      memory.delete(key);
      return Promise.resolve();
    }),
  };
});
