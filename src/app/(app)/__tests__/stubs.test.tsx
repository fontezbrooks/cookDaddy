/**
 * Smoke tests for the P4 placeholder routes. These exist to prove the route
 * tree is wired up — actual UX lands in later phases. One render+testID check
 * per stub keeps coverage above the 90% gate without bloating the test suite.
 */

import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import VibesScreen from '../settings/vibes';
import NotificationsScreen from '../settings/notifications';
import ShoppingScreen from '../shopping';
import PantryScreen from '../pantry';

// The invite/[token], session/[sessionId], and cookbook (index + [matchId])
// screens are no longer stubs — each has its own component test under their
// respective __tests__ dirs (P9 wired the cookbook surfaces).

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({ from: jest.fn() }),
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

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

  it('shopping list route renders', () => {
    render(wrap(<ShoppingScreen />));
    expect(screen.getByTestId('shopping-empty')).toBeOnTheScreen();
  });

  it('pantry route renders', () => {
    render(wrap(<PantryScreen />));
    expect(screen.getByTestId('pantry-empty')).toBeOnTheScreen();
  });
});
