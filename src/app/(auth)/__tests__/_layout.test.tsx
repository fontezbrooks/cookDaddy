import { render } from '@testing-library/react-native';

import AuthLayout from '../_layout';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Stack: (props: { children?: React.ReactNode }) =>
      React.createElement('Stack', null, props.children),
  };
});

describe('(auth)/_layout', () => {
  it('renders the navigation stack', () => {
    const tree = render(<AuthLayout />);
    expect(tree.UNSAFE_getByType('Stack' as never)).toBeTruthy();
  });
});
