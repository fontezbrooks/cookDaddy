/**
 * Profile editor — name + avatar persist via update on the users table.
 * RLS (users_self_update) keeps writes scoped to the owner; the screen sends
 * the .eq('id', userId) filter so it can't accidentally update another row
 * even with service-role-leaking misconfig.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ProfileScreen from '../profile';

const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(() => ({ from: mockFrom })),
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ProfileScreen', () => {
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

  it('loads the current display_name and avatar_url from users', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { display_name: 'Fontez', avatar_url: 'https://x' },
        error: null,
      }),
    });

    render(wrap(<ProfileScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('profile-display-name').props.value).toBe('Fontez');
      expect(screen.getByTestId('profile-avatar-url').props.value).toBe('https://x');
    });
  });

  it('updates users with new name + avatar scoped by id=userId', async () => {
    const update = jest.fn().mockReturnThis();
    const eqUpdate = jest.fn().mockResolvedValue({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: { display_name: 'Fontez', avatar_url: null }, error: null }),
      })
      .mockReturnValue({ update: update.mockReturnValue({ eq: eqUpdate }) });

    render(wrap(<ProfileScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('profile-display-name').props.value).toBe('Fontez');
    });

    fireEvent.changeText(screen.getByTestId('profile-display-name'), 'Fontez Brooks');
    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-save'));
    });

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: 'Fontez Brooks' }),
      );
      expect(eqUpdate).toHaveBeenCalledWith('id', 'user_clerk_xyz');
    });
  });
});
