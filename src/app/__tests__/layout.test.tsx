import { render } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import RootLayout from '@/app/_layout';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Stack: (props: { children?: React.ReactNode }) =>
      React.createElement('Stack', null, props.children),
    ThemeProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('ThemeProvider', null, children),
    DefaultTheme: { dark: false, colors: {} },
    DarkTheme: { dark: true, colors: {} },
  };
});

const mockedUseColorScheme = useColorScheme as jest.Mock;

describe('RootLayout', () => {
  it('renders the navigation stack inside a theme provider in light mode', () => {
    mockedUseColorScheme.mockReturnValue('light');
    const tree = render(<RootLayout />);
    expect(tree.UNSAFE_getByType('Stack' as never)).toBeTruthy();
    expect(tree.UNSAFE_getByType('ThemeProvider' as never)).toBeTruthy();
  });

  it('renders the dark theme when color scheme is dark', () => {
    mockedUseColorScheme.mockReturnValue('dark');
    const tree = render(<RootLayout />);
    expect(tree.UNSAFE_getByType('ThemeProvider' as never)).toBeTruthy();
  });
});
