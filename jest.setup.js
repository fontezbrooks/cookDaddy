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
