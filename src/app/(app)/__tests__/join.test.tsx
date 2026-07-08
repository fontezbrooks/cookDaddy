import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PodRpcError } from '@/lib/pod-rpcs';
import { __resetPodStoreForTests } from '@/state/usePodStore';

import JoinScreen from '../join';

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
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('JoinScreen', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    mockConsume.mockReset();
    mockFetchPartner.mockReset();
    mockReplace.mockClear();
    mockBack.mockClear();
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_bob',
      getToken: jest.fn().mockResolvedValue(null),
      signOut: jest.fn(),
    } as never);
  });

  it('joins a pod from a typed invite code', async () => {
    mockConsume.mockResolvedValueOnce({ podId: 'pod-abc', alreadyMember: false });
    mockFetchPartner.mockResolvedValueOnce({
      partnerId: 'user_alice',
      partnerDisplayName: 'Alice',
    });

    render(wrap(<JoinScreen />));

    fireEvent.changeText(screen.getByTestId('join-code-input'), 'ABCD1234');
    fireEvent.press(screen.getByTestId('join-submit'));

    await waitFor(() => {
      expect(mockConsume).toHaveBeenCalledWith(expect.anything(), 'ABCD1234');
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('renders invite-not-found copy when the code is invalid', async () => {
    mockConsume.mockRejectedValueOnce(new PodRpcError('invite_not_found'));

    render(wrap(<JoinScreen />));

    fireEvent.changeText(screen.getByTestId('join-code-input'), 'ABCD1234');
    fireEvent.press(screen.getByTestId('join-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('join-error-invite_not_found')).toBeOnTheScreen();
    });
  });
});
