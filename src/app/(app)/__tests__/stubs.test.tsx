/**
 * Smoke tests for the P4 placeholder routes. These exist to prove the route
 * tree is wired up — actual UX lands in later phases. One render+testID check
 * per stub keeps coverage above the 90% gate without bloating the test suite.
 */

import { render, screen } from '@testing-library/react-native';

import VibesScreen from '../settings/vibes';
import NotificationsScreen from '../settings/notifications';
import CookbookIndex from '../cookbook';
import CookbookDetail from '../cookbook/[matchId]';
import ShoppingScreen from '../shopping';
import PantryScreen from '../pantry';

// The invite/[token] and session/[sessionId] screens are no longer stubs —
// each has its own component test under their respective __tests__ dirs.

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    matchId: 'fixture-match',
  }),
}));

describe('placeholder routes', () => {
  it('vibes settings renders the three toggle rows', () => {
    // No longer a stub as of P6e — the full Vibes screen has its own test
    // file. This entry just ensures the route module still mounts inside
    // the broader stubs sweep so a future regression on imports surfaces.
    render(<VibesScreen />);
    expect(screen.getByTestId('vibes-haptics')).toBeOnTheScreen();
  });

  it('notifications settings renders the stub copy', () => {
    render(<NotificationsScreen />);
    expect(screen.getByTestId('notifications-stub')).toBeOnTheScreen();
  });

  it('cookbook index renders', () => {
    render(<CookbookIndex />);
    expect(screen.getByTestId('cookbook-stub')).toBeOnTheScreen();
  });

  it('cookbook detail surfaces match id from URL params', () => {
    render(<CookbookDetail />);
    expect(screen.getByTestId('cookbook-detail-stub')).toHaveTextContent(/fixture-match/);
  });

  it('shopping list stub renders', () => {
    render(<ShoppingScreen />);
    expect(screen.getByTestId('shopping-stub')).toBeOnTheScreen();
  });

  it('pantry stub renders', () => {
    render(<PantryScreen />);
    expect(screen.getByTestId('pantry-stub')).toBeOnTheScreen();
  });
});
