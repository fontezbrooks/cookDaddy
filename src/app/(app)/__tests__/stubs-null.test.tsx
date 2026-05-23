/**
 * Cover the null-token branches of the dynamic-route stubs. The primary
 * stubs.test exercises the happy path; this one nails the fallback string
 * for branch coverage.
 */

/* eslint-disable import/first */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
}));

import InviteScreen from '../invite/[token]';
import SessionScreen from '../session/[sessionId]';
import CookbookDetail from '../cookbook/[matchId]';

describe('dynamic route stubs (no params)', () => {
  it('invite/[token] surfaces "(none)" when no token in URL', () => {
    render(<InviteScreen />);
    expect(screen.getByTestId('invite-stub')).toHaveTextContent(/\(none\)/);
  });

  it('session/[sessionId] surfaces "(none)" when no id in URL', () => {
    render(<SessionScreen />);
    expect(screen.getByTestId('session-stub')).toHaveTextContent(/\(none\)/);
  });

  it('cookbook/[matchId] surfaces "(none)" when no id in URL', () => {
    render(<CookbookDetail />);
    expect(screen.getByTestId('cookbook-detail-stub')).toHaveTextContent(/\(none\)/);
  });
});
