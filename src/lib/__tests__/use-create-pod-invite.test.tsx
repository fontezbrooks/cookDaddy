import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Share } from 'react-native';

import { PodRpcError } from '@/lib/pod-rpcs';

import { useCreatePodInvite } from '../use-create-pod-invite';

const mockCreateInvite = jest.fn();
jest.mock('@/lib/pod-rpcs', () => {
  const actual = jest.requireActual('@/lib/pod-rpcs');
  return {
    ...actual,
    createPodInvite: (...args: unknown[]) => mockCreateInvite(...args),
  };
});

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(() => ({ rpc: jest.fn() })),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCreatePodInvite', () => {
  beforeEach(() => {
    mockCreateInvite.mockReset();
  });

  it('shares a successful invite link and sets the waiting hint', async () => {
    mockCreateInvite.mockResolvedValueOnce({
      token: 'tok-xyz',
      expiresAt: '2099-01-01T00:00:00Z',
      podId: 'pod-123',
    });
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);

    const { result } = renderHook(() => useCreatePodInvite(), { wrapper });

    await act(async () => {
      result.current.createInvite();
    });

    await waitFor(() => {
      expect(mockCreateInvite).toHaveBeenCalledTimes(1);
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://cookdaddy.app/invite/tok-xyz',
          message: expect.stringContaining('https://cookdaddy.app/invite/tok-xyz'),
        }),
      );
      expect(result.current.hint).toMatch(/Waiting for your partner/);
    });

    shareSpy.mockRestore();
  });

  it('sets the already-paired hint without sharing for already_in_a_pod', async () => {
    mockCreateInvite.mockRejectedValueOnce(new PodRpcError('already_in_a_pod', 'already_in_a_pod'));
    const shareSpy = jest.spyOn(Share, 'share');
    const { result } = renderHook(() => useCreatePodInvite(), { wrapper });

    await act(async () => {
      result.current.createInvite();
    });

    await waitFor(() => {
      expect(result.current.hint).toMatch(/already paired/i);
    });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('keeps the invite-created hint when the share sheet is dismissed', async () => {
    mockCreateInvite.mockResolvedValueOnce({
      token: 'tok-xyz',
      expiresAt: '2099-01-01T00:00:00Z',
      podId: 'pod-123',
    });
    const shareSpy = jest.spyOn(Share, 'share').mockRejectedValue(new Error('dismissed'));
    const { result } = renderHook(() => useCreatePodInvite(), { wrapper });

    await act(async () => {
      result.current.createInvite();
    });

    await waitFor(() => {
      expect(result.current.hint).toMatch(/Invite created/);
    });
    expect(shareSpy).toHaveBeenCalledTimes(1);

    shareSpy.mockRestore();
  });

  it('sets a generic retry hint for unknown invite errors', async () => {
    mockCreateInvite.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCreatePodInvite(), { wrapper });

    await act(async () => {
      result.current.createInvite();
    });

    await waitFor(() => {
      expect(result.current.hint).toMatch(/try again/i);
    });
  });
});
