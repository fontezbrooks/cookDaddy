/**
 * Deck-metadata hook contract (P6c). Given the ordered deck_recipe_ids
 * array returned by start_session, fetches recipe rows (id, title,
 * image_url) for visible cards and returns them IN DECK ORDER. Postgres
 * does not preserve an `in (uuid[])` order, so the hook must re-sort
 * client-side; that ordering invariant is what these tests pin down.
 */

import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { useDeck } from '@/lib/use-deck';

const mockIn = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        in: (...args: unknown[]) => mockIn(...args),
      }),
    }),
  }),
}));

function Harness({ recipeIds }: { recipeIds: string[] }) {
  const { data, isLoading } = useDeck(recipeIds);
  if (isLoading) return <Text testID="deck-loading">loading</Text>;
  return <Text testID="deck-titles">{(data ?? []).map((r) => r.title).join('|')}</Text>;
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

describe('useDeck', () => {
  beforeEach(() => {
    mockIn.mockReset();
    setSignedIn();
  });

  it('returns recipes in the deck_recipe_ids order even when Postgres reshuffles them', async () => {
    // Server returns them out of order; the hook must re-sort by deck order.
    mockIn.mockResolvedValue({
      data: [
        { id: 'r-3', title: 'C', image_url: null },
        { id: 'r-1', title: 'A', image_url: null },
        { id: 'r-2', title: 'B', image_url: null },
      ],
      error: null,
    });

    render(wrap(<Harness recipeIds={['r-1', 'r-2', 'r-3']} />));

    await waitFor(() => {
      expect(screen.getByTestId('deck-titles')).toHaveTextContent('A|B|C');
    });
    expect(mockIn).toHaveBeenCalledWith('id', ['r-1', 'r-2', 'r-3']);
  });

  it('returns an empty array (not undefined) when the deck is empty', async () => {
    render(wrap(<Harness recipeIds={[]} />));
    await waitFor(() => {
      expect(screen.getByTestId('deck-titles')).toHaveTextContent('');
    });
    // Empty deck must not hit the network.
    expect(mockIn).not.toHaveBeenCalled();
  });

  it('skips ids the server did not return (e.g. recipe deleted mid-session) without failing', async () => {
    mockIn.mockResolvedValue({
      data: [
        { id: 'r-1', title: 'A', image_url: null },
        // r-2 missing
        { id: 'r-3', title: 'C', image_url: null },
      ],
      error: null,
    });

    render(wrap(<Harness recipeIds={['r-1', 'r-2', 'r-3']} />));

    await waitFor(() => {
      expect(screen.getByTestId('deck-titles')).toHaveTextContent('A|C');
    });
  });

  it('throws (TanStack surfaces it) when supabase returns an error', async () => {
    mockIn.mockResolvedValue({ data: null, error: { message: 'boom' } });

    let caught: unknown;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, throwOnError: (e) => ((caught = e), false) },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness recipeIds={['r-1']} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(caught).toBeDefined();
    });
    expect((caught as Error).message).toMatch(/boom/);
  });
});
