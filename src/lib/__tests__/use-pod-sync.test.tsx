/**
 * Pod-sync hook contract (DESIGN §16.1 + WORKFLOW §8). Drives three
 * reconciliation paths from a server membership query:
 *
 *   • remote pod ≠ local pod → push partner into store
 *   • remote empty + local pod set → raise partner-removed flag
 *   • remote = local → no-op unless the local partner is unknown
 */

/* eslint-disable import/first */
import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

const mockFetchPartner = jest.fn();
jest.mock('@/lib/pod-rpcs', () => {
  const actual = jest.requireActual('@/lib/pod-rpcs');
  return {
    ...actual,
    fetchPartnerForPod: (...args: unknown[]) => mockFetchPartner(...args),
  };
});

const mockMaybeSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ maybeSingle: mockMaybeSingle }),
        }),
      }),
    }),
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
    mockFetchPartner.mockReset();
    mockMaybeSingle.mockReset();
    setSignedIn();
  });

  it('pushes the remote pod + partner into the store when the store is empty', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { pod_id: 'pod-1' }, error: null });
    mockFetchPartner.mockResolvedValueOnce({
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(usePodStore.getState()).toMatchObject({
        activePodId: 'pod-1',
        partnerId: 'user_alice',
        partnerDisplayName: 'Alice',
      });
    });
  });

  it('falls back to a placeholder name when the partner row is not visible yet', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { pod_id: 'pod-1' }, error: null });
    mockFetchPartner.mockResolvedValueOnce(null);

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(usePodStore.getState().partnerDisplayName).toBe('Your partner');
    });
  });

  it('raises partnerRemoved when the local store had a pod but remote has none', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-stale',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(wrap(<Harness />));

    await waitFor(() => {
      const state = usePodStore.getState();
      expect(state.activePodId).toBeNull();
      expect(state.partnerRemoved).toBe(true);
    });
  });

  it('is a no-op when remote and local pods already match', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-1',
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });
    mockMaybeSingle.mockResolvedValue({ data: { pod_id: 'pod-1' }, error: null });

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(mockMaybeSingle).toHaveBeenCalled();
    });
    // fetchPartnerForPod should NOT be re-called for an in-sync pod.
    expect(mockFetchPartner).not.toHaveBeenCalled();
    expect(usePodStore.getState().activePodId).toBe('pod-1');
  });

  it('refetches partner for the same pod when partnerId is empty (solo pod gains a partner)', async () => {
    usePodStore.getState().setActivePod({
      podId: 'pod-1',
      partnerId: '',
      partnerDisplayName: 'Your partner',
    });
    mockMaybeSingle.mockResolvedValue({ data: { pod_id: 'pod-1' }, error: null });
    mockFetchPartner.mockResolvedValueOnce({
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });

    render(wrap(<Harness />));

    await waitFor(() => {
      expect(usePodStore.getState()).toMatchObject({
        activePodId: 'pod-1',
        partnerId: 'user_alice',
        partnerDisplayName: 'Alice',
      });
    });
    expect(mockFetchPartner).toHaveBeenCalled();
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
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(usePodStore.getState().activePodId).toBeNull();
  });
});
