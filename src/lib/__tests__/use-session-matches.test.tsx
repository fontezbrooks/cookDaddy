import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionMatches } from '@/lib/use-session-matches';

type RecipeRow = {
  id: string;
  title: string;
  image_url: string | null;
};

type MatchRow = {
  id: string;
  recipe_id: string;
  matched_at: string;
  recipes: RecipeRow | RecipeRow[] | null;
};

const mockQueryState = {
  rows: [] as MatchRow[] | null,
  error: null as { message: string } | null,
};

const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

const mockClient = {
  from: mockFrom,
};

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

const queryClients: QueryClient[] = [];

function resetSupabaseMock(): void {
  mockQueryState.rows = [];
  mockQueryState.error = null;

  mockOrder
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ data: mockQueryState.rows, error: mockQueryState.error }),
    );
  mockEq.mockReset().mockImplementation(() => ({ order: mockOrder }));
  mockSelect.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockFrom.mockReset().mockImplementation(() => ({ select: mockSelect }));
}

function setRows(rows: MatchRow[]): void {
  mockQueryState.rows = rows;
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

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const recipeA: RecipeRow = {
  id: 'recipe-a',
  title: 'Aglio e Olio',
  image_url: 'https://example.test/a.jpg',
};

const recipeB: RecipeRow = {
  id: 'recipe-b',
  title: 'Bean Chili',
  image_url: null,
};

describe('useSessionMatches', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setSignedIn();
  });

  afterEach(() => {
    queryClients.splice(0).forEach((client) => client.clear());
  });

  it('maps rows in matched_at ascending query order', async () => {
    setRows([
      {
        id: 'match-a',
        recipe_id: 'recipe-a',
        matched_at: '2026-05-23T12:00:00.000Z',
        recipes: recipeA,
      },
      {
        id: 'match-b',
        recipe_id: 'recipe-b',
        matched_at: '2026-05-23T12:05:00.000Z',
        recipes: recipeB,
      },
    ]);

    const { result } = renderHook(() => useSessionMatches('sess-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([
      {
        matchId: 'match-a',
        recipeId: 'recipe-a',
        title: 'Aglio e Olio',
        imageUrl: 'https://example.test/a.jpg',
      },
      {
        matchId: 'match-b',
        recipeId: 'recipe-b',
        title: 'Bean Chili',
        imageUrl: null,
      },
    ]);
    expect(mockSelect).toHaveBeenCalledWith(
      'id, recipe_id, matched_at, recipes(id, title, image_url)',
    );
    expect(mockEq).toHaveBeenCalledWith('session_id', 'sess-1');
    expect(mockOrder).toHaveBeenCalledWith('matched_at', { ascending: true });
  });

  it('maps recipe joins returned as either objects or single-element arrays', async () => {
    setRows([
      {
        id: 'match-a',
        recipe_id: 'recipe-a',
        matched_at: '2026-05-23T12:00:00.000Z',
        recipes: recipeA,
      },
      {
        id: 'match-b',
        recipe_id: 'recipe-b',
        matched_at: '2026-05-23T12:05:00.000Z',
        recipes: [recipeB],
      },
    ]);

    const { result } = renderHook(() => useSessionMatches('sess-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.map((match) => match.title)).toEqual([
        'Aglio e Olio',
        'Bean Chili',
      ]);
    });
  });

  it('skips rows with missing recipe joins', async () => {
    setRows([
      {
        id: 'match-missing',
        recipe_id: 'recipe-missing',
        matched_at: '2026-05-23T12:00:00.000Z',
        recipes: null,
      },
      {
        id: 'match-b',
        recipe_id: 'recipe-b',
        matched_at: '2026-05-23T12:05:00.000Z',
        recipes: [recipeB],
      },
    ]);

    const { result } = renderHook(() => useSessionMatches('sess-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.map((match) => match.matchId)).toEqual(['match-b']);
    });
  });

  it('disables the query when sessionId is empty', () => {
    const { result } = renderHook(() => useSessionMatches(''), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(result.current).toEqual({ data: undefined, isLoading: false, error: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('surfaces Supabase errors through the query result', async () => {
    mockQueryState.error = { message: 'read failed' };

    const { result } = renderHook(() => useSessionMatches('sess-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe('read failed');
    });
  });
});
