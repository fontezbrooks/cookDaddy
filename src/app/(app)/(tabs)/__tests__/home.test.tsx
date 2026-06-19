/**
 * Home screen contract per WORKFLOW §7 exit criteria:
 *   • Renders the signed-in user's display_name from the users table.
 *   • Renders "No pod yet" empty state when usePodStore has no active pod.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Share } from 'react-native';

import { PodRpcError } from '@/lib/pod-rpcs';
import { __resetPodStoreForTests } from '@/state/usePodStore';

import HomeScreen from '../home';

// Supabase factory is mocked so the home screen never needs a real network.
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn((table: string) => {
  if (table === 'dietary_profiles') {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    };
  }
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: mockSingle,
  };
});
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(() => ({
    from: mockFrom,
  })),
  ensureSelfUserRow: jest.fn().mockResolvedValue(undefined),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Link: ({ children, href, testID }: { children: ReactNode; href: string; testID?: string }) => {
    const React = require('react');
    return React.createElement('Link', { href, testID }, children);
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockCreateInvite = jest.fn();
const mockDissolvePod = jest.fn();
jest.mock('@/lib/pod-rpcs', () => {
  const actual = jest.requireActual('@/lib/pod-rpcs');
  return {
    ...actual,
    createPodInvite: (...args: unknown[]) => mockCreateInvite(...args),
    dissolvePod: (...args: unknown[]) => mockDissolvePod(...args),
  };
});

const mockStartSession = jest.fn();
let mockDeckSize: number | undefined;
jest.mock('@/lib/session-rpcs', () => {
  const actual = jest.requireActual('@/lib/session-rpcs');
  return {
    ...actual,
    startSession: (...args: unknown[]) => mockStartSession(...args),
  };
});

jest.mock('@/lib/use-deck-size-flag', () => ({
  useDeckSizeFlag: () => mockDeckSize,
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('HomeScreen', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    mockFrom.mockClear();
    mockSingle.mockClear();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockCreateInvite.mockReset();
    mockDissolvePod.mockReset();
    mockStartSession.mockReset();
    mockDeckSize = undefined;
    mockPush.mockReset();
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_clerk_xyz',
      getToken: jest.fn().mockResolvedValue('jwt-fixture'),
      signOut: jest.fn(),
    } as never);
  });

  it("renders the user's display_name from Supabase", async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Fontez', avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent(/Fontez/);
    });
  });

  it('renders the "No pod yet" empty state when there is no active pod', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-empty-state')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('home-empty-state')).toHaveTextContent(/No pod yet/);
  });

  it('starts a session and routes to /session/<id> from the paired view', async () => {
    mockDeckSize = 15;
    mockSingle.mockResolvedValue({
      data: { display_name: 'Paired User', avatar_url: null },
      error: null,
    });
    const { usePodStore } = require('@/state/usePodStore');
    usePodStore.getState().setActivePod({
      podId: 'pod_abc',
      partnerId: 'partner_xyz',
      partnerDisplayName: 'Partner',
    });
    mockStartSession.mockResolvedValueOnce({
      sessionId: 'sess_new',
      deckRecipeIds: ['r1', 'r2'],
    });

    render(wrap(<HomeScreen />));
    await waitFor(() => expect(screen.getByTestId('home-start-session')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-start-session'));

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledWith(expect.anything(), 'pod_abc', 15);
      expect(mockPush).toHaveBeenCalledWith('/session/sess_new');
    });
  });

  it('surfaces an error hint when start_session rejects', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Paired User', avatar_url: null },
      error: null,
    });
    const { usePodStore } = require('@/state/usePodStore');
    usePodStore.getState().setActivePod({
      podId: 'pod_abc',
      partnerId: 'partner_xyz',
      partnerDisplayName: 'Partner',
    });
    mockStartSession.mockRejectedValueOnce(new Error('boom'));

    render(wrap(<HomeScreen />));
    await waitFor(() => expect(screen.getByTestId('home-start-session')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-start-session'));

    await waitFor(() => {
      expect(screen.getByTestId('home-start-session-error')).toBeOnTheScreen();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('surfaces a Manage pod link when an active pod is set', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Paired User', avatar_url: null },
      error: null,
    });
    const { usePodStore } = require('@/state/usePodStore');
    usePodStore.getState().setActivePod({
      podId: 'pod_abc',
      partnerId: 'partner_xyz',
      partnerDisplayName: 'Partner',
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-manage-pod')).toBeOnTheScreen();
    });
  });

  it('leaves the active pod from the paired view after confirmation', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Paired User', avatar_url: null },
      error: null,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const leave = (buttons ?? []).find((button) => button.style === 'destructive');
      leave?.onPress?.();
    });
    const { usePodStore } = require('@/state/usePodStore');
    usePodStore.getState().setActivePod({
      podId: 'pod_abc',
      partnerId: 'partner_xyz',
      partnerDisplayName: 'Partner',
    });
    mockDissolvePod.mockResolvedValueOnce(undefined);

    render(wrap(<HomeScreen />));
    await waitFor(() => expect(screen.getByTestId('home-leave-pod')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-leave-pod'));

    await waitFor(() => {
      expect(mockDissolvePod).toHaveBeenCalledWith(expect.anything(), 'pod_abc');
      expect(usePodStore.getState().activePodId).toBeNull();
    });

    alertSpy.mockRestore();
  });

  it('renders a Shopping list link', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-cta-shopping')).toBeOnTheScreen();
    });
  });

  it('shows the dietary nudge when dietary preferences are missing', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-dietary-nudge')).toBeOnTheScreen();
    });
  });

  it('hides the dietary nudge when any dietary preference is enabled', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        user_id: 'user_clerk_xyz',
        vegetarian: false,
        vegan: true,
        gluten_free: false,
        dairy_free: false,
        low_fodmap: false,
      },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent(/Solo User/);
    });
    expect(screen.queryByTestId('home-dietary-nudge')).toBeNull();
  });

  it('hides the empty state when an active pod is set', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Paired User', avatar_url: null },
      error: null,
    });
    // Use the actual store (mocked store under test). Importing inside the
    // test keeps this independent of the dietary/profile tests' setup.
    const { usePodStore } = require('@/state/usePodStore');
    usePodStore.getState().setActivePod({
      podId: 'pod_abc',
      partnerId: 'partner_xyz',
      partnerDisplayName: 'Partner',
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent(/Paired User/);
    });
    expect(screen.queryByTestId('home-empty-state')).toBeNull();
  });

  it('renders the partner-removed banner when the store flag is raised, and clears it on ack', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });
    const { usePodStore } = require('@/state/usePodStore');
    usePodStore.getState().notePartnerRemoved();

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('partner-removed-banner')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('partner-removed-ack'));
    await waitFor(() => {
      expect(screen.queryByTestId('partner-removed-banner')).toBeNull();
    });
  });

  it('renders the Create invite link CTA in the empty state', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-create-invite')).toBeOnTheScreen();
    });
  });

  it('mints a token via create_pod_invite and opens the Share sheet on tap', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });
    mockCreateInvite.mockResolvedValueOnce({
      token: 'tok-xyz',
      expiresAt: '2099-01-01T00:00:00Z',
      podId: 'pod-123',
    });
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);

    render(wrap(<HomeScreen />));
    await waitFor(() => expect(screen.getByTestId('home-create-invite')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-create-invite'));

    await waitFor(() => {
      expect(mockCreateInvite).toHaveBeenCalledTimes(1);
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://cookdaddy.app/invite/tok-xyz',
          message: expect.stringContaining('https://cookdaddy.app/invite/tok-xyz'),
        }),
      );
      expect(screen.getByTestId('home-invite-hint')).toHaveTextContent(/Waiting for your partner/);
    });

    shareSpy.mockRestore();
  });

  it('shows a guarded hint when create_pod_invite rejects with already_in_a_pod', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: 'Solo User', avatar_url: null },
      error: null,
    });
    mockCreateInvite.mockRejectedValueOnce(new PodRpcError('already_in_a_pod', 'already_in_a_pod'));
    const shareSpy = jest.spyOn(Share, 'share');

    render(wrap(<HomeScreen />));
    await waitFor(() => expect(screen.getByTestId('home-create-invite')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-create-invite'));

    await waitFor(() => {
      expect(screen.getByTestId('home-invite-hint')).toHaveTextContent(/already paired/i);
    });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('falls back to "there" when display_name is missing on the row', async () => {
    mockSingle.mockResolvedValue({
      data: { display_name: null, avatar_url: null },
      error: null,
    });

    render(wrap(<HomeScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent(/there/);
    });
  });
});
