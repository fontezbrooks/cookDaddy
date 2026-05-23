/**
 * Session screen contract per docs/WORKFLOW/README.md §9:
 *   • Missing sessionId   → friendly "no id" placeholder.
 *   • Session not found   → "session not found" with back-home CTA.
 *   • status=lobby        → renders deck size + "Start swiping" CTA that calls
 *                           markSessionActive and invalidates the query.
 *   • status=active       → deck placeholder (real deck lands in P6c).
 *   • status=ended        → ended summary with back-home CTA.
 *   • markSessionActive rejection → variant copy.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SessionRpcError } from '@/lib/session-rpcs';

import SessionScreen from '../[sessionId]';

const mockMarkActive = jest.fn();
jest.mock('@/lib/session-rpcs', () => {
  const actual = jest.requireActual('@/lib/session-rpcs');
  return {
    ...actual,
    markSessionActive: (...args: unknown[]) => mockMarkActive(...args),
  };
});

// SwipeDeck is exercised by its own test file. Mock it here to keep the
// screen test focused on routing between lobby/active/ended branches.
// The stub exposes a testID button that lets a test fire onMatch
// synthetically — the match-overlay wiring is the screen's responsibility.
jest.mock('@/components/swipe-deck', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    SwipeDeck: (props: {
      sessionId: string;
      recipeIds: string[];
      onMatch?: (p: unknown) => void;
      onLocalCommit?: (p: { recipeId: string; direction: 'left' | 'right' }) => void;
      partnerRightCommittedRecipeIds?: ReadonlySet<string>;
    }) => {
      return React.createElement(
        View,
        { testID: 'swipe-deck-stub' },
        React.createElement(Text, null, `deck:${props.recipeIds.length}`),
        React.createElement(
          Pressable,
          {
            testID: 'swipe-deck-fire-match',
            onPress: () =>
              props.onMatch?.({
                matchId: 'm-1',
                recipeId: 'r-1',
                recipeTitle: 'Cacio e Pepe',
                recipeImageUrl: null,
              }),
          },
          React.createElement(Text, null, 'fire-match'),
        ),
        React.createElement(
          Pressable,
          {
            testID: 'swipe-deck-fire-local-commit-r1',
            onPress: () => props.onLocalCommit?.({ recipeId: 'r1', direction: 'right' }),
          },
          React.createElement(Text, null, 'fire-local-commit-r1'),
        ),
      );
    },
  };
});

jest.mock('@/components/session-summary', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    SessionSummary: (props: { endedReason: string | null }) =>
      React.createElement(
        View,
        { testID: 'session-summary-stub' },
        React.createElement(Text, null, props.endedReason ?? 'none'),
      ),
  };
});

jest.mock('@/components/match-overlay', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    MatchOverlay: (props: {
      payload: { recipeTitle: string };
      onClose: () => void;
      variant: string;
    }) =>
      React.createElement(
        View,
        { testID: 'match-overlay' },
        React.createElement(Text, null, props.payload.recipeTitle),
        React.createElement(Text, { testID: 'match-overlay-variant' }, props.variant),
        React.createElement(
          Pressable,
          { testID: 'match-overlay-secondary', onPress: props.onClose },
          React.createElement(Text, null, 'Keep swiping'),
        ),
      ),
  };
});

const mockUseSwipeBroadcast = jest.fn();
jest.mock('@/lib/use-swipe-broadcast', () => ({
  useSwipeBroadcast: () => mockUseSwipeBroadcast(),
}));

const mockUsePodMatchCount = jest.fn();
jest.mock('@/lib/use-pod-matches', () => ({
  usePodMatchCount: () => mockUsePodMatchCount(),
}));

const mockMaybeSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  }),
}));

const mockReplace = jest.fn();
const mockParams: { sessionId?: string } = { sessionId: 'sess-1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

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

function setSignedIn() {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alice',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

describe('SessionScreen', () => {
  beforeEach(() => {
    mockMarkActive.mockReset();
    mockMaybeSingle.mockReset();
    mockReplace.mockClear();
    mockParams.sessionId = 'sess-1';
    mockUsePodMatchCount.mockReset().mockReturnValue({ count: 1, isLoading: false });
    mockUseSwipeBroadcast.mockReset().mockReturnValue({
      partnerCommit: null,
      partnerProgress: null,
      partnerMatch: null,
      partnerCommittedRecipeIds: new Set<string>(),
      partnerRightCommittedRecipeIds: new Set<string>(),
      broadcastCommit: jest.fn().mockResolvedValue(undefined),
      broadcastProgress: jest.fn().mockResolvedValue(undefined),
      broadcastMatch: jest.fn().mockResolvedValue(undefined),
    });
    setSignedIn();
  });

  afterEach(() => {
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it('renders the no-id placeholder when sessionId is missing', () => {
    mockParams.sessionId = undefined;
    render(wrap(<SessionScreen />));
    expect(screen.getByTestId('session-missing-id')).toBeOnTheScreen();
  });

  it('renders the not-found state when the row does not exist', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('session-not-found')).toBeOnTheScreen();
    });
  });

  it('renders the lobby with deck size and Start swiping CTA when status=lobby', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'lobby',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1', 'r2', 'r3'],
        ended_reason: null,
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('session-lobby')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('session-lobby')).toHaveTextContent(/3 recipes/);
    expect(screen.getByTestId('session-start-swiping')).toBeOnTheScreen();
  });

  it('calls markSessionActive when Start swiping is tapped', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'lobby',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1'],
        ended_reason: null,
      },
      error: null,
    });
    mockMarkActive.mockResolvedValueOnce(undefined);

    render(wrap(<SessionScreen />));
    await waitFor(() => expect(screen.getByTestId('session-start-swiping')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('session-start-swiping'));

    await waitFor(() => {
      expect(mockMarkActive).toHaveBeenCalledWith(expect.anything(), 'sess-1');
    });
  });

  it('shows variant copy when markSessionActive rejects with session_not_pending', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'lobby',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1'],
        ended_reason: null,
      },
      error: null,
    });
    mockMarkActive.mockRejectedValueOnce(
      new SessionRpcError('session_not_pending', 'session_not_pending'),
    );

    render(wrap(<SessionScreen />));
    await waitFor(() => expect(screen.getByTestId('session-start-swiping')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('session-start-swiping'));

    await waitFor(() => {
      expect(screen.getByTestId('session-activate-error')).toHaveTextContent(/already ended/i);
    });
  });

  it('mounts SwipeDeck inside the active branch when status=active', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1', 'r2'],
        ended_reason: null,
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('session-active')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('swipe-deck-stub')).toBeOnTheScreen();
    expect(screen.getByTestId('swipe-deck-stub')).toHaveTextContent(/deck:2/);
  });

  it('renders the ended summary when status=ended', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'ended',
        pod_id: 'pod-1',
        deck_recipe_ids: [],
        ended_reason: 'completed',
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('session-summary-stub')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('session-summary-stub')).toHaveTextContent(/completed/);
  });

  it('mounts MatchOverlay when SwipeDeck reports a local match', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r-1'],
        ended_reason: null,
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-fire-match')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('swipe-deck-fire-match'));

    await waitFor(() => {
      expect(screen.getByTestId('match-overlay')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('match-overlay')).toHaveTextContent(/Cacio e Pepe/);
  });

  it('passes firstEver to MatchOverlay for a pod with zero prior matches', async () => {
    mockUsePodMatchCount.mockReturnValue({ count: 0, isLoading: false });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r-1'],
        ended_reason: null,
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-fire-match')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('swipe-deck-fire-match'));

    await waitFor(() => {
      expect(screen.getByTestId('match-overlay-variant')).toHaveTextContent('firstEver');
    });
  });

  it('mounts MatchOverlay when a partner broadcast fires (match.created)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r-1'],
        ended_reason: null,
      },
      error: null,
    });
    mockUseSwipeBroadcast.mockReturnValue({
      partnerCommit: null,
      partnerProgress: null,
      partnerMatch: {
        matchId: 'm-2',
        recipeId: 'r-2',
        recipeTitle: 'Roast Squash',
        recipeImageUrl: null,
      },
      partnerCommittedRecipeIds: new Set<string>(),
      partnerRightCommittedRecipeIds: new Set<string>(),
      broadcastCommit: jest.fn().mockResolvedValue(undefined),
      broadcastProgress: jest.fn().mockResolvedValue(undefined),
      broadcastMatch: jest.fn().mockResolvedValue(undefined),
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('match-overlay')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('match-overlay')).toHaveTextContent(/Roast Squash/);
  });

  it('renders one progress dot per recipe with empty default state (MATCH-UX §8.2)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1', 'r2', 'r3'],
        ended_reason: null,
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('session-progress-dots')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('session-progress-dot-r1')).toHaveProp(
      'accessibilityLabel',
      'Progress: empty',
    );
    expect(screen.getByTestId('session-progress-dot-r2')).toHaveProp(
      'accessibilityLabel',
      'Progress: empty',
    );
    expect(screen.getByTestId('session-progress-dot-r3')).toHaveProp(
      'accessibilityLabel',
      'Progress: empty',
    );
  });

  it('marks the dot half when only the local user committed (MATCH-UX §8.2)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1', 'r2'],
        ended_reason: null,
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-fire-local-commit-r1')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('swipe-deck-fire-local-commit-r1'));

    await waitFor(() => {
      expect(screen.getByTestId('session-progress-dot-r1')).toHaveProp(
        'accessibilityLabel',
        'Progress: half',
      );
    });
    expect(screen.getByTestId('session-progress-dot-r2')).toHaveProp(
      'accessibilityLabel',
      'Progress: empty',
    );
  });

  it('marks the dot half when only the partner committed (MATCH-UX §8.2)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1', 'r2'],
        ended_reason: null,
      },
      error: null,
    });
    mockUseSwipeBroadcast.mockReturnValue({
      partnerCommit: null,
      partnerProgress: null,
      partnerMatch: null,
      partnerCommittedRecipeIds: new Set(['r2']),
      partnerRightCommittedRecipeIds: new Set<string>(),
      broadcastCommit: jest.fn().mockResolvedValue(undefined),
      broadcastProgress: jest.fn().mockResolvedValue(undefined),
      broadcastMatch: jest.fn().mockResolvedValue(undefined),
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('session-progress-dot-r2')).toHaveProp(
        'accessibilityLabel',
        'Progress: half',
      );
    });
    expect(screen.getByTestId('session-progress-dot-r1')).toHaveProp(
      'accessibilityLabel',
      'Progress: empty',
    );
  });

  it('marks the dot full when BOTH partners committed (MATCH-UX §8.2)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r1', 'r2'],
        ended_reason: null,
      },
      error: null,
    });
    mockUseSwipeBroadcast.mockReturnValue({
      partnerCommit: null,
      partnerProgress: null,
      partnerMatch: null,
      partnerCommittedRecipeIds: new Set(['r1']),
      partnerRightCommittedRecipeIds: new Set(['r1']),
      broadcastCommit: jest.fn().mockResolvedValue(undefined),
      broadcastProgress: jest.fn().mockResolvedValue(undefined),
      broadcastMatch: jest.fn().mockResolvedValue(undefined),
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-fire-local-commit-r1')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('swipe-deck-fire-local-commit-r1'));

    await waitFor(() => {
      expect(screen.getByTestId('session-progress-dot-r1')).toHaveProp(
        'accessibilityLabel',
        'Progress: full',
      );
    });
  });

  it('dismisses MatchOverlay when Keep swiping is tapped', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        status: 'active',
        pod_id: 'pod-1',
        deck_recipe_ids: ['r-1'],
        ended_reason: null,
      },
      error: null,
    });

    render(wrap(<SessionScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-fire-match')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('swipe-deck-fire-match'));
    await waitFor(() => {
      expect(screen.getByTestId('match-overlay')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByTestId('match-overlay-secondary'));

    await waitFor(() => {
      expect(screen.queryByTestId('match-overlay')).not.toBeOnTheScreen();
    });
  });
});
