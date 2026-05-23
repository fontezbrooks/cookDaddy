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

import CookbookDetail from '../cookbook/[matchId]';

// invite/[token] and session/[sessionId] used to live here as stubs; each
// has its own component test now under the respective __tests__ dirs.

describe('dynamic route stubs (no params)', () => {
  it('cookbook/[matchId] surfaces "(none)" when no id in URL', () => {
    render(<CookbookDetail />);
    expect(screen.getByTestId('cookbook-detail-stub')).toHaveTextContent(/\(none\)/);
  });
});
