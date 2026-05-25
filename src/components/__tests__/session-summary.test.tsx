import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SessionSummary } from '@/components/session-summary';
import { haptics } from '@/lib/haptics';
import { startSession } from '@/lib/session-rpcs';
import { useSessionMatches } from '@/lib/use-session-matches';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockClient = {};
let mockDeckSize: number | undefined;

jest.mock('@/lib/use-session-matches', () => ({
  useSessionMatches: jest.fn(),
}));

jest.mock('@/lib/session-rpcs', () => ({
  startSession: jest.fn().mockResolvedValue({ sessionId: 'new-sess', deckRecipeIds: [] }),
}));

jest.mock('@/lib/use-deck-size-flag', () => ({
  useDeckSizeFlag: () => mockDeckSize,
}));

jest.mock('@/lib/haptics', () => ({
  haptics: {
    notificationSuccess: jest.fn(),
    selection: jest.fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

const queryClients: QueryClient[] = [];

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
  queryClients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setSignedIn(): void {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alice',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

function renderSummary(endedReason: string | null = 'completed') {
  return render(
    wrap(<SessionSummary sessionId="sess-1" podId="pod-1" endedReason={endedReason} />),
  );
}

describe('SessionSummary', () => {
  beforeEach(() => {
    jest.mocked(useSessionMatches).mockReset();
    jest.mocked(startSession).mockClear();
    jest.mocked(haptics.notificationSuccess).mockClear();
    jest.mocked(haptics.selection).mockClear();
    mockDeckSize = undefined;
    mockPush.mockClear();
    mockReplace.mockClear();
    setSignedIn();
  });

  afterEach(() => {
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it('renders the loading branch', () => {
    jest.mocked(useSessionMatches).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderSummary();

    expect(screen.getByTestId('session-summary-loading')).toBeOnTheScreen();
  });

  it('prioritizes partner_disconnect over matches and starts a fresh session', async () => {
    jest.mocked(useSessionMatches).mockReturnValue({
      data: [{ matchId: 'match-1', recipeId: 'recipe-1', title: 'Tacos', imageUrl: null }],
      isLoading: false,
      error: null,
    });

    renderSummary('partner_disconnect');

    expect(screen.getByTestId('session-summary-disconnected')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('session-summary-end'));
    expect(mockReplace).toHaveBeenCalledWith('/home');

    fireEvent.press(screen.getByTestId('session-summary-start-new'));
    await waitFor(() => {
      expect(startSession).toHaveBeenCalledWith(mockClient, 'pod-1', undefined);
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/session/new-sess');
    });
    expect(haptics.notificationSuccess).not.toHaveBeenCalled();
    expect(haptics.selection).not.toHaveBeenCalled();
  });

  it('renders matches, routes tiles and cookbook CTAs, and fires success haptic once', async () => {
    jest.mocked(useSessionMatches).mockReturnValue({
      data: [
        {
          matchId: 'match-1',
          recipeId: 'recipe-1',
          title: 'Tacos',
          imageUrl: 'https://example.test/tacos.jpg',
        },
        { matchId: 'match-2', recipeId: 'recipe-2', title: 'Soup', imageUrl: null },
      ],
      isLoading: false,
      error: null,
    });

    const view = renderSummary();

    expect(screen.getByTestId('session-summary-with-matches')).toHaveTextContent(/2 matches!/);
    expect(screen.getByTestId('session-summary-match-match-1')).toBeOnTheScreen();
    expect(screen.getByTestId('session-summary-match-match-2')).toBeOnTheScreen();
    expect(haptics.notificationSuccess).toHaveBeenCalledTimes(1);

    view.rerender(
      wrap(<SessionSummary sessionId="sess-1" podId="pod-1" endedReason="completed" />),
    );
    expect(haptics.notificationSuccess).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('session-summary-match-match-1'));
    expect(mockPush).toHaveBeenCalledWith('/cookbook/match-1');
    fireEvent.press(screen.getByTestId('session-summary-pick-dinner'));
    expect(mockPush).toHaveBeenCalledWith('/cookbook');

    fireEvent.press(screen.getByTestId('session-summary-swipe-more'));
    await waitFor(() => {
      expect(startSession).toHaveBeenCalledWith(mockClient, 'pod-1', undefined);
    });
  });

  it('renders singular copy for one match', () => {
    jest.mocked(useSessionMatches).mockReturnValue({
      data: [{ matchId: 'match-1', recipeId: 'recipe-1', title: 'Tacos', imageUrl: null }],
      isLoading: false,
      error: null,
    });

    renderSummary();

    expect(screen.getByTestId('session-summary-with-matches')).toHaveTextContent(/1 match!/);
  });

  it('renders no-match actions and fires selection haptic once', async () => {
    mockDeckSize = 25;
    jest.mocked(useSessionMatches).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    renderSummary();

    expect(screen.getByTestId('session-summary-no-matches')).toHaveTextContent(
      /Round complete! No matches yet\./,
    );
    expect(haptics.selection).toHaveBeenCalledTimes(1);
    expect(haptics.notificationSuccess).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('session-summary-try-again'));
    await waitFor(() => {
      expect(startSession).toHaveBeenCalledWith(mockClient, 'pod-1', 25);
    });

    fireEvent.press(screen.getByTestId('session-summary-adjust-filters'));
    expect(mockPush).toHaveBeenCalledWith('/settings/dietary');

    fireEvent.press(screen.getByTestId('session-summary-done'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });
});
