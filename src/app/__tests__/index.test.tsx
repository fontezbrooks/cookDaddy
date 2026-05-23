import { render } from '@testing-library/react-native';

import Index from '@/app/index';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Redirect: (props: { href: string }) => {
      mockRedirect(props.href);
      return React.createElement('Redirect', { href: props.href });
    },
  };
});

describe('Index', () => {
  it('redirects to /home (auth guard happens in (app)/_layout)', () => {
    render(<Index />);
    expect(mockRedirect).toHaveBeenCalledWith('/home');
  });
});
