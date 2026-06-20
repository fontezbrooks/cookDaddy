import { useAuth, useUser } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { useAuthStore } from '@/state/useAuthStore';
import { usePodStore } from '@/state/usePodStore';

import AccountSettingsScreen from '../account';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

function wrap(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('AccountSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ userId: 'user_x', displayName: 'X', avatarUrl: null });
    usePodStore.setState({
      activePodId: 'pod_x',
      partnerId: 'user_partner',
      partnerDisplayName: 'Partner',
      partnerRemoved: false,
    });
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_x',
      getToken: jest.fn().mockResolvedValue('jwt'),
      signOut: jest.fn().mockResolvedValue(undefined),
    } as never);
    jest.mocked(useUser).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { delete: jest.fn().mockResolvedValue(undefined) },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sign out clears session + stores + cache and redirects', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_x',
      getToken: jest.fn().mockResolvedValue('jwt'),
      signOut,
    } as never);

    render(wrap(<AccountSettingsScreen />));
    fireEvent.press(screen.getByTestId('account-sign-out'));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(useAuthStore.getState().userId).toBeNull();
      expect(usePodStore.getState().activePodId).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('delete confirmed calls user.delete then tears down', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    const deleteUser = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_x',
      getToken: jest.fn().mockResolvedValue('jwt'),
      signOut,
    } as never);
    jest.mocked(useUser).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { delete: deleteUser },
    } as never);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const destructive = (buttons ?? []).find((button) => button.style === 'destructive');
      destructive?.onPress?.();
    });

    render(wrap(<AccountSettingsScreen />));
    fireEvent.press(screen.getByTestId('account-delete'));

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledTimes(1);
      expect(signOut).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('delete cancelled does nothing', () => {
    const deleteUser = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useUser).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { delete: deleteUser },
    } as never);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const cancel = (buttons ?? []).find((button) => button.style === 'cancel');
      cancel?.onPress?.();
    });

    render(wrap(<AccountSettingsScreen />));
    fireEvent.press(screen.getByTestId('account-delete'));

    expect(deleteUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
