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

import SessionScreen from '../session/[sessionId]';
import CookbookDetail from '../cookbook/[matchId]';

// invite/[token] used to live here as a stub; it has its own component test
// at src/app/(app)/invite/__tests__/[token].test.tsx now.

describe('dynamic route stubs (no params)', () => {
  it('session/[sessionId] surfaces "(none)" when no id in URL', () => {
    render(<SessionScreen />);
    expect(screen.getByTestId('session-stub')).toHaveTextContent(/\(none\)/);
  });

  it('cookbook/[matchId] surfaces "(none)" when no id in URL', () => {
    render(<CookbookDetail />);
    expect(screen.getByTestId('cookbook-detail-stub')).toHaveTextContent(/\(none\)/);
  });
});
