/**
 * Root layout smoke test. The real provider tree pulls in native modules; the
 * jest.setup mocks make these render-safe. We just want to verify:
 *   • The layout renders without throwing (provider order doesn't blow up).
 */

import { render } from '@testing-library/react-native';

// jest.setup wires up Clerk/PostHog mocks. We still need to mock
// expo-router's Stack + ThemeProvider to keep the tree shallow.
jest.mock('expo-router', () => {
  const React = require('react');
  function Stack(props: { children?: React.ReactNode }) {
    return React.createElement('Stack', null, props.children);
  }
  function StackScreen(props: { name: string }) {
    return React.createElement('Stack.Screen', { name: props.name });
  }
  Stack.Screen = StackScreen;
  function ThemeProvider({ children }: { children?: React.ReactNode }) {
    return React.createElement('ThemeProvider', null, children);
  }
  return {
    Stack,
    ThemeProvider,
    DefaultTheme: { dark: false, colors: {} },
    DarkTheme: { dark: true, colors: {} },
  };
});

// expo-constants surfaces app.config extra block; the layout reads it at module
// load, so set values before requiring the module under test.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        clerkPublishableKey: 'pk_test_fixture',
        posthogKey: undefined, // skip PostHog wrap so the tree stays shallow
      },
    },
  },
}));

describe('RootLayout', () => {
  it('renders the navigation stack without throwing', () => {
    const RootLayout = require('@/app/_layout').default;
    const tree = render(<RootLayout />);
    expect(tree.UNSAFE_getByType('Stack' as never)).toBeTruthy();
    expect(tree.UNSAFE_getByType('ThemeProvider' as never)).toBeTruthy();
  });
});
