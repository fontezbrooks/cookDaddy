/**
 * Pod-sync hook contract (docs/POD-READ-PATH/README.md + DESIGN §16.1).
 * Drives four reconciliation paths from the get_my_pod() authoritative read:
 *
 *   • remote pod present → pod + partner land in the store inline
 *   • remote empty + local pod set → raise partner-removed flag
 *   • remote empty + local empty → server-confirmed podless (syncStatus ready)
 *   • read error → syncStatus 'error', pod state preserved, analytics event
 */

/* eslint-disable import/first */
import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

const mockGetMyPod = jest.fn();
jest.mock('@/lib/pod-rpcs', () => {
  const actual = jest.requireActual('@/lib/pod-rpcs');
  return {
    ...actual,
    getMyPod: (...args: unknown[]) => mockGetMyPod(...args),
  };
});

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({ rpc: jest.fn() }),
}));

const mockCapture = jest.fn();
jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({
    capture: mockCapture,
    identify: jest.fn(),
    group: jest.fn(),
    reset: jest.fn(),
  }),
}));

import { usePodSync } from '@/lib/use-pod-sync';

function Harness(): null {
  usePodSync();
  return null;
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setSignedIn(): void {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_bob',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

describe('usePodSync', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    mockGetMyPod.mockReset();
    mockCapture.mockReset();
    setSignedIn();
  });

  it('pushes the remote pod + inline partner into the store when the store is empty', async () => {
    mockGetMyPod.mockResolvedValue({
      podId: 'pod-1',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
      memberCount: 2,
    });

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(usePodStore.getState()).toMatchObject({
        activePodId: 'pod-1',
        partnerId: 'user_alice',
        partnerDisplayName: 'Alice',
        syncStatus: 'ready',
      });
    });
  });

  it('falls back to a placeholder name for a solo pod (null partner columns)', async () => {
    mockGetMyPod.mockResolvedValue({
      podId: 'pod-1',
      partnerId: null,
      partnerDisplayName: null,
      memberCount: 1,
    });

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(usePodStore.getState()).toMatchObject({
        activePodId: 'pod-1',
        partnerId: '',
        partnerDisplayName: 'Your partner',
      });
    });
  });

  it('raises partnerRemoved when the local store had a pod but remote has none', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-stale',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
    mockGetMyPod.mockResolvedValue(null);

    render(wrap(<Harness />));

    await waitFor(() => {
      const state = usePodStore.getState();
      expect(state.activePodId).toBeNull();
      expect(state.partnerRemoved).toBe(true);
      expect(state.syncStatus).toBe('ready');
    });
  });

  it('marks a confirmed podless state as ready WITHOUT raising partnerRemoved', async () => {
    mockGetMyPod.mockResolvedValue(null);

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(usePodStore.getState().syncStatus).toBe('ready');
    });
    expect(usePodStore.getState().partnerRemoved).toBe(false);
    expect(usePodStore.getState().activePodId).toBeNull();
  });

  it('flags a failed read as syncStatus=error, preserves pod state, and captures analytics', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-1',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
    mockGetMyPod.mockRejectedValue(new Error('rpc unreachable'));

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(usePodStore.getState().syncStatus).toBe('error');
    });
    // A failed read must NOT masquerade as "no pod".
    expect(usePodStore.getState().activePodId).toBe('pod-1');
    expect(usePodStore.getState().partnerRemoved).toBe(false);
    expect(mockCapture).toHaveBeenCalledWith('pod_membership_read_failed', {
      message: 'rpc unreachable',
    });
  });

  it('does nothing when there is no Clerk session', async () => {
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: jest.fn(),
      signOut: jest.fn(),
    } as never);

    render(wrap(<Harness />));

    // Give the effect a chance to no-op.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockGetMyPod).not.toHaveBeenCalled();
    expect(usePodStore.getState().activePodId).toBeNull();
    expect(usePodStore.getState().syncStatus).toBe('unknown');
  });
});
