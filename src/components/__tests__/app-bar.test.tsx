import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppBar } from '@/components/app-bar';

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    BlurView: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

describe('AppBar', () => {
  it('renders the title', () => {
    render(<AppBar title="Cookbook" />);

    expect(screen.getByText('Cookbook')).toBeOnTheScreen();
  });

  it('calls onBack when the back button is pressed', () => {
    const onBack = jest.fn();
    render(<AppBar title="Cookbook" testID="cookbook-bar" onBack={onBack} />);

    fireEvent.press(screen.getByTestId('cookbook-bar-back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
