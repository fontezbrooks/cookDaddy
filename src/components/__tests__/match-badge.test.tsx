import { render, screen } from '@testing-library/react-native';

import { MatchBadge } from '@/components/match-badge';

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    LinearGradient: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

describe('MatchBadge', () => {
  it('renders the label', () => {
    render(<MatchBadge label="92% match" />);

    expect(screen.getByText('92% match')).toBeOnTheScreen();
  });
});
