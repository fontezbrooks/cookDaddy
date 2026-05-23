/**
 * Dietary chip selector contract per WORKFLOW §7:
 *   • The chip toggles for the five dietary flags render and reflect saved
 *     state from dietary_profiles.
 *   • Toggling a chip writes (upserts) the row scoped to the current user.
 *   • The Supabase select uses .eq('user_id', auth_user_id()) — RLS smoke,
 *     proving the screen never tries to read another user's row.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import DietaryScreen from '../dietary';

const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(() => ({ from: mockFrom })),
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('DietaryScreen', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_clerk_xyz',
      getToken: jest.fn().mockResolvedValue('jwt-fixture'),
      signOut: jest.fn(),
    } as never);
  });

  it('renders all five dietary chips', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });

    render(wrap(<DietaryScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('chip-vegetarian')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('chip-vegan')).toBeOnTheScreen();
    expect(screen.getByTestId('chip-gluten-free')).toBeOnTheScreen();
    expect(screen.getByTestId('chip-dairy-free')).toBeOnTheScreen();
    expect(screen.getByTestId('chip-low-fodmap')).toBeOnTheScreen();
  });

  it('scopes the read to the current user (RLS-respecting query)', async () => {
    const eq = jest.fn().mockReturnThis();
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq,
      maybeSingle,
    });

    render(wrap(<DietaryScreen />));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('dietary_profiles');
      expect(eq).toHaveBeenCalledWith('user_id', 'user_clerk_xyz');
    });
  });

  it('upserts on chip toggle with the user_id pinned to the signed-in user', async () => {
    const upsert = jest.fn().mockReturnThis();
    const upsertSelect = jest.fn().mockResolvedValue({ data: [], error: null });
    mockFrom
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            user_id: 'user_clerk_xyz',
            vegetarian: false,
            vegan: false,
            gluten_free: false,
            dairy_free: false,
            low_fodmap: false,
          },
          error: null,
        }),
      })
      .mockReturnValue({
        upsert: upsert.mockReturnValue({ select: upsertSelect }),
      });

    render(wrap(<DietaryScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('chip-vegan')).toBeOnTheScreen();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('chip-vegan'));
    });

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user_clerk_xyz', vegan: true }),
        expect.objectContaining({ onConflict: 'user_id' }),
      );
    });
  });
});
