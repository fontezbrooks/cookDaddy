import { render } from '@testing-library/react-native';

import TabsLayout from '../_layout';

const mockTabsScreen = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');

  function Tabs(props: { children?: React.ReactNode; screenOptions?: unknown }) {
    return React.createElement('Tabs', { screenOptions: props.screenOptions }, props.children);
  }

  function TabsScreen(props: { name: string; options?: unknown }) {
    mockTabsScreen(props);
    return React.createElement('Tabs.Screen', props);
  }

  Tabs.Screen = TabsScreen;

  return { Tabs };
});

describe('(tabs)/_layout', () => {
  beforeEach(() => {
    mockTabsScreen.mockClear();
  });

  it('renders the five tab screens with icons in order', () => {
    const tree = render(<TabsLayout />);

    expect(tree.UNSAFE_getByType('Tabs' as never)).toBeTruthy();
    expect(mockTabsScreen).toHaveBeenCalledTimes(5);
    expect(mockTabsScreen.mock.calls.map(([props]) => props.name)).toEqual([
      'home',
      'cookbook',
      'fridge',
      'shopping',
      'settings',
    ]);
    expect(mockTabsScreen.mock.calls.map(([props]) => props.options.tabBarLabel)).toEqual([
      'Recipes',
      'Cookbook',
      'Fridge',
      'Shopping',
      'Settings',
    ]);
    const icons = mockTabsScreen.mock.calls.map(([props]) => props.options.tabBarIcon);
    expect(icons).toHaveLength(5);
    icons.forEach((icon) => expect(typeof icon).toBe('function'));
  });
});
