import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SettingsHubScreen from '../index';

jest.mock('expo-router', () => ({
  Link: ({ children, href, testID }: { children: ReactNode; href: string; testID?: string }) => {
    const React = require('react');
    return React.createElement('Link', { href, testID }, children);
  },
}));

describe('SettingsHubScreen', () => {
  it('renders the settings hub', () => {
    render(<SettingsHubScreen />);

    expect(screen.getByTestId('settings-hub')).toBeOnTheScreen();
  });
});
