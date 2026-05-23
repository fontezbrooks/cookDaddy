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
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SessionRpcError } from '@/lib/session-rpcs';

import { SwipeDeck } from '../swipe-deck';

const mockSubmitSwipe = jest.fn();
const mockEndSession = jest.fn();
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

const mockBroadcastCommit = jest.fn();
const mockBroadcastProgress = jest.fn();
const mockUseSwipeBroadcast = jest.fn();
jest.mock('@/lib/use-swipe-broadcast', () => ({
  useSwipeBroadcast: (...args: unknown[]) => mockUseSwipeBroadcast(...args),
}));

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({}) as unknown,
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

const RECIPE_DATA = [
  { id: 'r-1', title: 'Cacio e Pepe', imageUrl: null },
  { id: 'r-2', title: 'Roast Squash', imageUrl: null },
  { id: 'r-3', title: 'Bibimbap', imageUrl: null },
];

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
    setSignedIn();
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
});
