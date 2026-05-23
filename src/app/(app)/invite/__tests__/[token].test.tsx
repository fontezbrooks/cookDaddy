/**
 * Invite consume-flow contract per WORKFLOW §8:
 *   • Unsigned user → <Redirect /> to sign-in with the invite path in
 *     ?redirect= so we return here after auth.
 *   • Signed-in user → call consume_pod_invite(token) on mount, fetch the
 *     partner row, push the pod into the store, replace to /home.
 *   • Each Postgres error code surfaces distinct copy via a per-code testID.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PodRpcError } from '@/lib/pod-rpcs';
import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

import InviteTokenScreen from '../[token]';

const mockConsume = jest.fn();
const mockFetchPartner = jest.fn();
jest.mock('@/lib/pod-rpcs', () => {
  const actual = jest.requireActual('@/lib/pod-rpcs');
  return {
    ...actual,
    consumePodInvite: (...args: unknown[]) => mockConsume(...args),
    fetchPartnerForPod: (...args: unknown[]) => mockFetchPartner(...args),
  };
});

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(() => ({})),
}));

const mockReplace = jest.fn();
const mockRedirect = jest.fn();
const mockParams: { token?: string } = { token: 'tok_abc' };
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
    Redirect: (props: { href: string }) => {
      mockRedirect(props.href);
      return React.createElement('Redirect', { href: props.href });
    },
  };
});

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setSignedIn(signedIn: boolean, userId = 'user_bob') {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: signedIn,
    userId: signedIn ? userId : null,
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

describe('InviteTokenScreen', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    mockConsume.mockReset();
    mockFetchPartner.mockReset();
    mockReplace.mockClear();
    mockRedirect.mockClear();
    mockParams.token = 'tok_abc';
  });

  it('redirects unsigned visitors to /sign-in with the invite path in ?redirect=', () => {
    setSignedIn(false);
    render(wrap(<InviteTokenScreen />));
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const href = mockRedirect.mock.calls[0]![0] as string;
    expect(href).toMatch(/^\/\(auth\)\/sign-in\?redirect=/);
    expect(decodeURIComponent(href.split('redirect=')[1]!)).toBe('/invite/tok_abc');
  });

  it('calls consume_pod_invite with the URL token and lands the partner in the store', async () => {
    setSignedIn(true);
    mockConsume.mockResolvedValueOnce({ podId: 'pod-abc', alreadyMember: false });
    mockFetchPartner.mockResolvedValueOnce({
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });

    render(wrap(<InviteTokenScreen />));

    await waitFor(() => {
      expect(mockConsume).toHaveBeenCalledWith(expect.anything(), 'tok_abc');
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
    expect(usePodStore.getState()).toMatchObject({
      activePodId: 'pod-abc',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
  });

  it('still replaces to /home on already_member=true (idempotent re-tap)', async () => {
    setSignedIn(true);
    mockConsume.mockResolvedValueOnce({ podId: 'pod-abc', alreadyMember: true });
    mockFetchPartner.mockResolvedValueOnce({
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });

    render(wrap(<InviteTokenScreen />));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('falls back to "Your partner" when the partner row is not yet visible', async () => {
    setSignedIn(true);
    mockConsume.mockResolvedValueOnce({ podId: 'pod-abc', alreadyMember: false });
    mockFetchPartner.mockResolvedValueOnce(null);

    render(wrap(<InviteTokenScreen />));

    await waitFor(() => {
      expect(usePodStore.getState().partnerDisplayName).toBe('Your partner');
    });
  });

  it.each([
    ['invite_expired'],
    ['invite_already_consumed'],
    ['cannot_consume_own_invite'],
    ['consumer_already_in_a_pod'],
    ['invite_not_found'],
  ] as const)('shows variant copy for %s and does not navigate home', async (code) => {
    setSignedIn(true);
    mockConsume.mockRejectedValueOnce(new PodRpcError(code, code));

    render(wrap(<InviteTokenScreen />));

    await waitFor(() => {
      expect(screen.getByTestId(`invite-error-${code}`)).toBeOnTheScreen();
    });
    expect(mockReplace).not.toHaveBeenCalledWith('/home');
  });

  it('falls back to unknown copy for non-coded errors', async () => {
    setSignedIn(true);
    mockConsume.mockRejectedValueOnce(new Error('boom'));

    render(wrap(<InviteTokenScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('invite-error-unknown')).toBeOnTheScreen();
    });
  });
});
