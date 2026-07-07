/**
 * Active-deck contract (P6c). Renders a two-card stack from the
 * deck_recipe_ids list, dispatches submit_swipe on commits, and ends the
 * session on exhaustion. Gesture worklets are layered on top in the
 * component; tests exercise the same commit path via the accessibility
 * Like / Dislike buttons (NFR-A4 also mandates them).
 *
 *   • top card renders title from useDeck metadata,
 *   • Like / Dislike → submit_swipe(right/left) + broadcast + advance,
 *   • match=true → onMatch callback,
 *   • deck exhausted → end_session('completed'),
 *   • RPC error → card stays visible, retry banner appears.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SessionRpcError } from '@/lib/session-rpcs';

import { SwipeDeck } from '../swipe-deck';

const mockSubmitSwipe = jest.fn();
const mockEndSession = jest.fn();
const mockCapture = jest.fn();
jest.mock('@/lib/session-rpcs', () => {
  const actual = jest.requireActual('@/lib/session-rpcs');
  return {
    ...actual,
    submitSwipe: (...args: unknown[]) => mockSubmitSwipe(...args),
    endSession: (...args: unknown[]) => mockEndSession(...args),
  };
});

const mockUseDeck = jest.fn();
jest.mock('@/lib/use-deck', () => ({
  useDeck: (...args: unknown[]) => mockUseDeck(...args),
}));

const mockEnqueueSwipe = jest.fn();
const mockPeekSwipeQueue = jest.fn();
const mockRemoveFromSwipeQueue = jest.fn();
jest.mock('@/lib/swipe-queue', () => ({
  enqueueSwipe: (...args: unknown[]) => mockEnqueueSwipe(...args),
  peekSwipeQueue: (...args: unknown[]) => mockPeekSwipeQueue(...args),
  removeFromSwipeQueue: (...args: unknown[]) => mockRemoveFromSwipeQueue(...args),
}));

const mockBroadcastCommit = jest.fn();
const mockBroadcastProgress = jest.fn();
const mockUseSwipeBroadcast = jest.fn();
jest.mock('@/lib/use-swipe-broadcast', () => ({
  useSwipeBroadcast: (...args: unknown[]) => mockUseSwipeBroadcast(...args),
}));

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({}) as unknown,
}));

jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({
    capture: mockCapture,
    identify: jest.fn(),
    group: jest.fn(),
    reset: jest.fn(),
  }),
}));

const mockHapticsImpactLight = jest.fn();
const mockHapticsSelection = jest.fn();
jest.mock('@/lib/haptics', () => ({
  haptics: {
    impactLight: () => mockHapticsImpactLight(),
    impactHeavy: jest.fn(),
    selection: () => mockHapticsSelection(),
    notificationSuccess: jest.fn(),
  },
}));

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
    userId: 'user_alice',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

const DECK_IDS = ['r-1', 'r-2', 'r-3'];
const STREAK_DECK_IDS = ['r-1', 'r-2', 'r-3', 'r-4'];

const RECIPE_DATA = [
  { id: 'r-1', title: 'Cacio e Pepe', imageUrl: null },
  { id: 'r-2', title: 'Roast Squash', imageUrl: null },
  { id: 'r-3', title: 'Bibimbap', imageUrl: null },
];

const STREAK_RECIPE_DATA = [...RECIPE_DATA, { id: 'r-4', title: 'Tomato Risotto', imageUrl: null }];

async function pressLikeAndWaitForTitle(title: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId('swipe-deck-like'));
  });
  await waitFor(() => {
    expect(screen.getByTestId('swipe-deck-card-current')).toHaveTextContent(title);
  });
}

describe('SwipeDeck', () => {
  beforeEach(() => {
    mockSubmitSwipe.mockReset();
    mockEndSession.mockReset();
    mockUseDeck.mockReset();
    mockBroadcastCommit.mockReset().mockResolvedValue(undefined);
    mockBroadcastProgress.mockReset().mockResolvedValue(undefined);
    mockUseSwipeBroadcast.mockReset().mockReturnValue({
      partnerCommit: null,
      partnerProgress: null,
      partnerMatch: null,
      broadcastCommit: mockBroadcastCommit,
      broadcastProgress: mockBroadcastProgress,
      broadcastMatch: jest.fn().mockResolvedValue(undefined),
    });
    mockHapticsImpactLight.mockReset();
    mockHapticsSelection.mockReset();
    mockEnqueueSwipe.mockReset();
    mockPeekSwipeQueue.mockReset().mockReturnValue([]);
    mockRemoveFromSwipeQueue.mockReset();
    mockCapture.mockReset();
    setSignedIn();
  });

  it('fires haptics.impactLight on right-swipe commit', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValueOnce({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });
    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));
    expect(mockHapticsImpactLight).toHaveBeenCalledTimes(1);
  });

  it('fires haptics.selection on left-swipe commit', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValueOnce({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });
    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('swipe-deck-dislike'));
    });
    expect(mockHapticsSelection).toHaveBeenCalledTimes(1);
  });

  it('renders a loading placeholder while the deck metadata is loading', () => {
    mockUseDeck.mockReturnValue({ data: undefined, isLoading: true });
    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    expect(screen.getByTestId('swipe-deck-loading')).toBeOnTheScreen();
  });

  it('renders the top card title from useDeck metadata', () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    expect(screen.getByTestId('swipe-deck-card-current')).toHaveTextContent('Cacio e Pepe');
  });

  it('Like button calls submitSwipe(right) for the current recipe and broadcasts', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValueOnce({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(mockSubmitSwipe).toHaveBeenCalledWith(expect.anything(), 'sess-1', 'r-1', 'right');
    });
    expect(mockBroadcastCommit).toHaveBeenCalledWith({
      recipeId: 'r-1',
      direction: 'right',
    });
  });

  it('captures the completed swipe analytics event without PII properties', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValueOnce({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith(
        'swipe',
        expect.objectContaining({
          session_id: 'sess-1',
          recipe_id: 'r-1',
          direction: 'right',
          card_index: 0,
          time_since_prev_swipe_ms: 0,
        }),
      );
    });
    const props = mockCapture.mock.calls.find(([event]) => event === 'swipe')?.[1] as Record<
      string,
      unknown
    >;
    expect(Object.keys(props).sort()).toEqual(
      ['card_index', 'direction', 'recipe_id', 'session_id', 'time_since_prev_swipe_ms'].sort(),
    );
    expect(props).not.toHaveProperty('name');
    expect(props).not.toHaveProperty('display_name');
    expect(props).not.toHaveProperty('email');
  });

  it('Dislike button calls submitSwipe(left)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValueOnce({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-dislike'));

    await waitFor(() => {
      expect(mockSubmitSwipe).toHaveBeenCalledWith(expect.anything(), 'sess-1', 'r-1', 'left');
    });
  });

  it('advances to the next card after a successful commit', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValue({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    expect(screen.getByTestId('swipe-deck-card-current')).toHaveTextContent('Cacio e Pepe');

    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-card-current')).toHaveTextContent('Roast Squash');
    });
  });

  it('invokes onMatch with enriched recipe payload AND broadcasts match.created', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValueOnce({
      match: true,
      matchId: 'm-1',
      alreadyMatched: false,
    });
    const mockBroadcastMatch = jest.fn().mockResolvedValue(undefined);
    mockUseSwipeBroadcast.mockReturnValue({
      partnerCommit: null,
      partnerProgress: null,
      partnerMatch: null,
      broadcastCommit: mockBroadcastCommit,
      broadcastProgress: mockBroadcastProgress,
      broadcastMatch: mockBroadcastMatch,
    });

    const onMatch = jest.fn();
    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} onMatch={onMatch} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(onMatch).toHaveBeenCalledWith({
        matchId: 'm-1',
        recipeId: 'r-1',
        recipeTitle: 'Cacio e Pepe',
        recipeImageUrl: null,
      });
    });
    expect(mockBroadcastMatch).toHaveBeenCalledWith({
      matchId: 'm-1',
      recipeId: 'r-1',
      recipeTitle: 'Cacio e Pepe',
      recipeImageUrl: null,
    });
  });

  it('calls endSession(completed) exactly once when the last card is committed', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValue({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });
    mockEndSession.mockResolvedValue(undefined);

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={['r-1']} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(mockEndSession).toHaveBeenCalledWith(expect.anything(), 'sess-1', 'completed');
    });
    expect(mockEndSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('swipe-deck-empty')).toBeOnTheScreen();
  });

  it('invokes onLocalCommit after a successful submit_swipe (MATCH-UX §8.2)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValueOnce({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });
    const onLocalCommit = jest.fn();

    render(
      wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} onLocalCommit={onLocalCommit} />),
    );
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(onLocalCommit).toHaveBeenCalledWith({ recipeId: 'r-1', direction: 'right' });
    });
  });

  it('does not invoke onLocalCommit when submit_swipe rejects (MATCH-UX §8.2)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockRejectedValueOnce(new SessionRpcError('session_not_active'));
    const onLocalCommit = jest.fn();

    render(
      wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} onLocalCommit={onLocalCommit} />),
    );
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-error')).toBeOnTheScreen();
    });
    expect(onLocalCommit).not.toHaveBeenCalled();
  });

  it('flashes green edge on right-swipe commit and clears after 200ms (MATCH-UX §8.1)', async () => {
    jest.useFakeTimers();
    try {
      mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
      mockSubmitSwipe.mockResolvedValue({
        match: false,
        matchId: null,
        alreadyMatched: false,
      });

      render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
      fireEvent.press(screen.getByTestId('swipe-deck-like'));

      // Border color flips to green immediately after press.
      expect(screen.getByTestId('swipe-deck-card-current')).toHaveStyle({
        borderColor: '#FF850B',
      });

      await act(async () => {
        jest.advanceTimersByTime(201);
      });

      // After 200ms the flash clears (top card may now be the next recipe,
      // but the *current* one carries transparent border again).
      expect(screen.getByTestId('swipe-deck-card-current')).toHaveStyle({
        borderColor: 'transparent',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('flashes red edge on left-swipe commit (MATCH-UX §8.1)', () => {
    jest.useFakeTimers();
    try {
      mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
      mockSubmitSwipe.mockResolvedValue({
        match: false,
        matchId: null,
        alreadyMatched: false,
      });

      render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
      fireEvent.press(screen.getByTestId('swipe-deck-dislike'));

      expect(screen.getByTestId('swipe-deck-card-current')).toHaveStyle({
        borderColor: '#BA1A1A',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the card visible and shows a retry banner when submitSwipe rejects', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockRejectedValueOnce(new SessionRpcError('session_not_active'));

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-error')).toBeOnTheScreen();
    });
    // Still on r-1 — no advance on error.
    expect(screen.getByTestId('swipe-deck-card-current')).toHaveTextContent('Cacio e Pepe');
  });

  it('enqueues the swipe in MMKV when submitSwipe fails transiently (NFR-R1)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    // Raw network error — not a SessionRpcError — counts as retryable.
    mockSubmitSwipe.mockRejectedValueOnce(new Error('network down'));

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(mockEnqueueSwipe).toHaveBeenCalledWith('sess-1', {
        recipeId: 'r-1',
        direction: 'right',
      });
    });
    expect(screen.getByTestId('swipe-deck-error')).toHaveTextContent(/retry when you’re back/i);
  });

  it('does NOT enqueue when submitSwipe fails with a non-retryable code (NFR-R1)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockRejectedValueOnce(new SessionRpcError('session_not_active'));

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-error')).toBeOnTheScreen();
    });
    expect(mockEnqueueSwipe).not.toHaveBeenCalled();
  });

  it('drains the queue on mount (NFR-R1)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockPeekSwipeQueue.mockReturnValue([{ recipeId: 'r-old', direction: 'right', enqueuedAt: 1 }]);
    mockSubmitSwipe.mockResolvedValue({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));

    await waitFor(() => {
      expect(mockSubmitSwipe).toHaveBeenCalledWith(expect.anything(), 'sess-1', 'r-old', 'right');
    });
    expect(mockRemoveFromSwipeQueue).toHaveBeenCalledWith('sess-1', {
      recipeId: 'r-old',
      direction: 'right',
      enqueuedAt: 1,
    });
  });

  it('drains the queue on the next successful commit (NFR-R1)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    // First call: live commit succeeds. Second call (during drain): queued
    // r-old succeeds too.
    mockPeekSwipeQueue
      .mockReturnValueOnce([]) // mount-time drain → empty
      .mockReturnValueOnce([{ recipeId: 'r-old', direction: 'left', enqueuedAt: 1 }]); // post-success drain
    mockSubmitSwipe.mockResolvedValue({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));
    fireEvent.press(screen.getByTestId('swipe-deck-like'));

    await waitFor(() => {
      expect(mockSubmitSwipe).toHaveBeenCalledWith(expect.anything(), 'sess-1', 'r-old', 'left');
    });
  });

  it('drops non-retryable queued items without retrying further (NFR-R1)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockPeekSwipeQueue.mockReturnValue([{ recipeId: 'r-old', direction: 'right', enqueuedAt: 1 }]);
    mockSubmitSwipe.mockRejectedValueOnce(new SessionRpcError('session_not_active'));

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));

    await waitFor(() => {
      expect(mockRemoveFromSwipeQueue).toHaveBeenCalledWith('sess-1', {
        recipeId: 'r-old',
        direction: 'right',
        enqueuedAt: 1,
      });
    });
  });

  it('keeps queued items in place when drain hits a transient failure (NFR-R1)', async () => {
    mockUseDeck.mockReturnValue({ data: RECIPE_DATA, isLoading: false });
    mockPeekSwipeQueue.mockReturnValue([{ recipeId: 'r-old', direction: 'right', enqueuedAt: 1 }]);
    mockSubmitSwipe.mockRejectedValueOnce(new Error('network down'));

    render(wrap(<SwipeDeck sessionId="sess-1" recipeIds={DECK_IDS} />));

    await waitFor(() => {
      expect(mockSubmitSwipe).toHaveBeenCalledWith(expect.anything(), 'sess-1', 'r-old', 'right');
    });
    expect(mockRemoveFromSwipeQueue).not.toHaveBeenCalled();
  });

  it('renders the streak pill after 3 consecutive both-right swipes (MATCH-UX §7)', async () => {
    mockUseDeck.mockReturnValue({ data: STREAK_RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValue({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(
      wrap(
        <SwipeDeck
          sessionId="sess-1"
          recipeIds={STREAK_DECK_IDS}
          partnerRightCommittedRecipeIds={new Set(['r-1', 'r-2', 'r-3'])}
        />,
      ),
    );

    await pressLikeAndWaitForTitle('Roast Squash');
    await pressLikeAndWaitForTitle('Bibimbap');
    await pressLikeAndWaitForTitle('Tomato Risotto');

    expect(screen.getByTestId('swipe-deck-streak')).toHaveTextContent('🔥 streak');
    expect(screen.getByTestId('swipe-deck-streak')).toHaveProp('accessibilityLabel', 'On a streak');
  });

  it('does not render the streak pill after only 2 both-right swipes (MATCH-UX §7)', async () => {
    mockUseDeck.mockReturnValue({ data: STREAK_RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValue({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(
      wrap(
        <SwipeDeck
          sessionId="sess-1"
          recipeIds={STREAK_DECK_IDS}
          partnerRightCommittedRecipeIds={new Set(['r-1', 'r-2'])}
        />,
      ),
    );

    await pressLikeAndWaitForTitle('Roast Squash');
    await pressLikeAndWaitForTitle('Bibimbap');

    expect(screen.queryByTestId('swipe-deck-streak')).not.toBeOnTheScreen();
  });

  it('keeps the streak pill hidden when a left swipe breaks the run (MATCH-UX §7)', async () => {
    mockUseDeck.mockReturnValue({ data: STREAK_RECIPE_DATA, isLoading: false });
    mockSubmitSwipe.mockResolvedValue({
      match: false,
      matchId: null,
      alreadyMatched: false,
    });

    render(
      wrap(
        <SwipeDeck
          sessionId="sess-1"
          recipeIds={STREAK_DECK_IDS}
          partnerRightCommittedRecipeIds={new Set(['r-1', 'r-2', 'r-3'])}
        />,
      ),
    );

    await pressLikeAndWaitForTitle('Roast Squash');
    await act(async () => {
      fireEvent.press(screen.getByTestId('swipe-deck-dislike'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('swipe-deck-card-current')).toHaveTextContent('Bibimbap');
    });
    await pressLikeAndWaitForTitle('Tomato Risotto');

    expect(screen.queryByTestId('swipe-deck-streak')).not.toBeOnTheScreen();
  });
});
