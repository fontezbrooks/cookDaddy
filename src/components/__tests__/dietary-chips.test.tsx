import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DietaryChips } from '../dietary-chips';

const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(() => ({ from: mockFrom })),
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('DietaryChips', () => {
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

  it('toggles a dietary chip on and off and persists both states', async () => {
    const upsert = jest
      .fn()
      .mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) });
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
      .mockReturnValue({ upsert });

    render(wrap(<DietaryChips />));

    await waitFor(() => expect(screen.getByTestId('chip-vegan')).toBeOnTheScreen());
    expect(screen.getByTestId('chip-vegan')).toHaveProp('accessibilityState', {
      selected: false,
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('chip-vegan'));
    });

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user_clerk_xyz', vegan: true }),
        expect.objectContaining({ onConflict: 'user_id' }),
      );
      expect(screen.getByTestId('chip-vegan')).toHaveProp('accessibilityState', {
        selected: true,
      });
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('chip-vegan'));
    });

    await waitFor(() => {
      expect(upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ user_id: 'user_clerk_xyz', vegan: false }),
        expect.objectContaining({ onConflict: 'user_id' }),
      );
      expect(screen.getByTestId('chip-vegan')).toHaveProp('accessibilityState', {
        selected: false,
      });
    });
  });
});
