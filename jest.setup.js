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
  const withSpring = (v) => v;
  const withTiming = (v) => v;
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
    withSpring,
    withTiming,
    runOnJS,
    runOnUI,
    interpolate,
    Easing: { bezier: () => () => 0, linear: () => 0 },
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
