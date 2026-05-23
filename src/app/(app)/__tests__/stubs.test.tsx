/**
 * Smoke tests for the P4 placeholder routes. These exist to prove the route
 * tree is wired up — actual UX lands in later phases. One render+testID check
 * per stub keeps coverage above the 90% gate without bloating the test suite.
 */

import { render, screen } from '@testing-library/react-native';

import VibesScreen from '../settings/vibes';
import NotificationsScreen from '../settings/notifications';
import SessionScreen from '../session/[sessionId]';
import CookbookIndex from '../cookbook';
import CookbookDetail from '../cookbook/[matchId]';
import ShoppingScreen from '../shopping';
import PantryScreen from '../pantry';

// The invite/[token] screen is no longer a stub — it has its own component
// test at src/app/(app)/invite/__tests__/[token].test.tsx.

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    sessionId: 'fixture-session',
    matchId: 'fixture-match',
  }),
}));

describe('placeholder routes', () => {
  it('vibes settings renders the stub copy', () => {
    render(<VibesScreen />);
    expect(screen.getByTestId('vibes-stub')).toBeOnTheScreen();
  });

  it('notifications settings renders the stub copy', () => {
    render(<NotificationsScreen />);
    expect(screen.getByTestId('notifications-stub')).toBeOnTheScreen();
  });

  it('session/[sessionId] surfaces the id from URL params', () => {
    render(<SessionScreen />);
    expect(screen.getByTestId('session-stub')).toHaveTextContent(/fixture-session/);
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
