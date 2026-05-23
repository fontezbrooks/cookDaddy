/**
 * Pod settings (dissolve) screen contract:
 *   • No active pod → empty state with home CTA, no dissolve button.
 *   • Active pod   → partner name + Dissolve button.
 *   • Tap Dissolve → Alert.alert with destructive confirm.
 *   • Confirm     → dissolvePod RPC → clearActivePod + router.replace('/home').
 *   • RPC reject  → inline error + store unchanged.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { PodRpcError } from '@/lib/pod-rpcs';
import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

import PodSettingsScreen from '../pod';

const mockDissolve = jest.fn();
jest.mock('@/lib/pod-rpcs', () => {
  const actual = jest.requireActual('@/lib/pod-rpcs');
  return {
    ...actual,
    dissolvePod: (...args: unknown[]) => mockDissolve(...args),
  };
});

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({}),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Link: ({ children, href, testID }: { children: ReactNode; href: string; testID?: string }) =>
      React.createElement('Link', { href, testID }, children),
    useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  };
});

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setSignedIn() {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_bob',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

describe('PodSettingsScreen', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    mockDissolve.mockReset();
    mockReplace.mockClear();
    setSignedIn();
  });

  it('renders the empty state with a home CTA when there is no active pod', () => {
    render(wrap(<PodSettingsScreen />));
    expect(screen.getByTestId('pod-settings-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('pod-settings-dissolve')).toBeNull();
  });

  it('renders the partner name + Dissolve button when paired', () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-1',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });

    render(wrap(<PodSettingsScreen />));

    expect(screen.getByTestId('pod-settings-partner')).toHaveTextContent(/Alice/);
    expect(screen.getByTestId('pod-settings-dissolve')).toBeOnTheScreen();
  });

  it('opens a confirm Alert on Dissolve tap and calls dissolvePod + clears store on confirm', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-1',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
    mockDissolve.mockResolvedValueOnce(undefined);

    // Auto-press the destructive button when Alert is invoked.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const destructive = (buttons ?? []).find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    render(wrap(<PodSettingsScreen />));
    fireEvent.press(screen.getByTestId('pod-settings-dissolve'));

    await waitFor(() => {
      expect(mockDissolve).toHaveBeenCalledWith(expect.anything(), 'pod-1');
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
    expect(usePodStore.getState().activePodId).toBeNull();

    alertSpy.mockRestore();
  });

  it('does NOT call dissolvePod when the user cancels the Alert', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-1',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const cancel = (buttons ?? []).find((b) => b.style === 'cancel');
      cancel?.onPress?.();
    });

    render(wrap(<PodSettingsScreen />));
    fireEvent.press(screen.getByTestId('pod-settings-dissolve'));

    // Give the (non-)mutation a tick.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockDissolve).not.toHaveBeenCalled();
    expect(usePodStore.getState().activePodId).toBe('pod-1');

    alertSpy.mockRestore();
  });

  it('shows the inline error and keeps the pod when dissolvePod rejects', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-1',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
    mockDissolve.mockRejectedValueOnce(new PodRpcError('not_member', 'not_member'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const destructive = (buttons ?? []).find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    render(wrap(<PodSettingsScreen />));
    fireEvent.press(screen.getByTestId('pod-settings-dissolve'));

    await waitFor(() => {
      expect(screen.getByTestId('pod-settings-error')).toBeOnTheScreen();
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(usePodStore.getState().activePodId).toBe('pod-1');

    alertSpy.mockRestore();
  });
});
