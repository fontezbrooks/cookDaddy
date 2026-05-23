/**
 * Home screen contract per WORKFLOW §7 exit criteria:
 *   • Renders the signed-in user's display_name from the users table.
 *   • Renders "No pod yet" empty state when usePodStore has no active pod.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { __resetPodStoreForTests } from '@/state/usePodStore';

import HomeScreen from '../home';

// Supabase factory is mocked so the home screen never needs a real network.
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
    })),
  })),
  ensureSelfUserRow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => {
    const React = require('react');
    return React.createElement('Link', { href }, children);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('HomeScreen', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockSingle.mockClear();
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_clerk_xyz',
      getToken: jest.fn().mockResolvedValue('jwt-fixture'),
      signOut: jest.fn(),
    } as never);
  });

  it("renders the user's display_name from Supabase", async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Fontez', avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent(/Fontez/);
    });
  });

  it('renders the "No pod yet" empty state when there is no active pod', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-empty-state')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('home-empty-state')).toHaveTextContent(/No pod yet/);
  });

  it('hides the empty state when an active pod is set', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Paired User', avatar_url: null },
      error: null,
    });
    // Use the actual store (mocked store under test). Importing inside the
    // test keeps this independent of the dietary/profile tests' setup.
    const { usePodStore } = require('@/state/usePodStore');
    usePodStore.getState().setActivePod({
      podId: 'pod_abc',
      partnerId: 'partner_xyz',
      partnerDisplayName: 'Partner',
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent(/Paired User/);
    });
    expect(screen.queryByTestId('home-empty-state')).toBeNull();
  });

  it('falls back to "there" when display_name is missing on the row', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: null, avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent(/there/);
    });
  });
});
