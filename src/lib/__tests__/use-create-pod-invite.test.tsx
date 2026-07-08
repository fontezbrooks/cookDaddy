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

  it('stores a successful invite without opening the share sheet', async () => {
    mockCreateInvite.mockResolvedValueOnce({
      token: 'tok-xyz',
      expiresAt: '2099-01-01T00:00:00Z',
      podId: 'pod-123',
    });
    const shareSpy = jest.spyOn(Share, 'share');

    const { result } = renderHook(() => useCreatePodInvite(), { wrapper });

    await act(async () => {
      result.current.createInvite();
    });

    await waitFor(() => {
      expect(mockCreateInvite).toHaveBeenCalledTimes(1);
      expect(result.current.invite).toEqual({
        code: 'tok-xyz',
        expiresAt: '2099-01-01T00:00:00Z',
      });
      expect(result.current.hint).toMatch(/Share this code/);
    });
    expect(shareSpy).not.toHaveBeenCalled();

    shareSpy.mockRestore();
  });

  it('invalidates membership after creating an invite', async () => {
    mockCreateInvite.mockResolvedValueOnce({
      token: 'tok-xyz',
      expiresAt: '2099-01-01T00:00:00Z',
      podId: 'pod-123',
    });
    const invalidateSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');

    try {
      const { result } = renderHook(() => useCreatePodInvite(), { wrapper });

      await act(async () => {
        result.current.createInvite();
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith(
          expect.objectContaining({ queryKey: expect.arrayContaining(['pod-membership']) }),
        );
      });
    } finally {
      invalidateSpy.mockRestore();
    }
  });

  it('shares the stored invite from the explicit share action', async () => {
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
      expect(result.current.invite).toEqual({
        code: 'tok-xyz',
        expiresAt: '2099-01-01T00:00:00Z',
      });
    });

    act(() => {
      result.current.share();
    });

    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cookdaddy.app/invite/tok-xyz',
        message: expect.stringContaining('https://cookdaddy.app/invite/tok-xyz'),
      }),
    );

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

  it('keeps the invite hint when the explicit share sheet is dismissed', async () => {
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
      expect(result.current.hint).toMatch(/Share this code/);
    });
    act(() => {
      result.current.share();
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
