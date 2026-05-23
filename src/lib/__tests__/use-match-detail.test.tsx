import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useMatchDetail } from '@/lib/use-match-detail';

type IngredientRow = {
  id: string;
  name: string;
  original_text: string | null;
  amount: number | null;
  unit: string | null;
  position: number | null;
};

type RecipeRow = {
  title: string;
  image_url: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  source_name: string | null;
  recipe_ingredients: IngredientRow[] | null;
};

type MatchRow = {
  id: string;
  recipe_id: string;
  cooked_at: string | null;
  removed_at: string | null;
  recipes: RecipeRow | RecipeRow[] | null;
};

const mockQueryState = {
  row: null as MatchRow | null,
  error: null as { message: string } | null,
};

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockClient = { from: mockFrom };

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

function resetSupabaseMock(): void {
  mockQueryState.row = null;
  mockQueryState.error = null;
  mockMaybeSingle
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ data: mockQueryState.row, error: mockQueryState.error }),
    );
  mockEq.mockReset().mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));
  mockSelect.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockFrom.mockReset().mockImplementation(() => ({ select: mockSelect }));
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
    defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const recipe: RecipeRow = {
  title: 'Lemony Pasta',
  image_url: 'https://example.test/pasta.jpg',
  ready_in_minutes: 25,
  servings: 3,
  source_url: 'https://example.test/recipe',
  source_name: 'Example Kitchen',
  recipe_ingredients: [
    {
      id: 'ing-2',
      name: 'lemon',
      original_text: '1 lemon, zested',
      amount: 1,
      unit: null,
      position: 2,
    },
    {
      id: 'ing-1',
      name: 'spaghetti',
      original_text: '8 oz spaghetti',
      amount: 8,
      unit: 'oz',
      position: 1,
    },
  ],
};

function matchRow(recipes: RecipeRow | RecipeRow[] | null = recipe): MatchRow {
  return {
    id: 'match-1',
    recipe_id: 'recipe-1',
    cooked_at: null,
    removed_at: null,
    recipes,
  };
}

describe('useMatchDetail', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setSignedIn();
  });

  it('maps a nested recipe and sorts ingredients by position', async () => {
    mockQueryState.row = matchRow();

    const { result } = renderHook(() => useMatchDetail('match-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({
      matchId: 'match-1',
      recipeId: 'recipe-1',
      title: 'Lemony Pasta',
      imageUrl: 'https://example.test/pasta.jpg',
      readyInMinutes: 25,
      servings: 3,
      sourceUrl: 'https://example.test/recipe',
      sourceName: 'Example Kitchen',
      cookedAt: null,
      removedAt: null,
      ingredients: [
        {
          id: 'ing-1',
          name: 'spaghetti',
          originalText: '8 oz spaghetti',
          amount: 8,
          unit: 'oz',
        },
        {
          id: 'ing-2',
          name: 'lemon',
          originalText: '1 lemon, zested',
          amount: 1,
          unit: null,
        },
      ],
    });
    expect(mockSelect).toHaveBeenCalledWith(
      'id, recipe_id, cooked_at, removed_at, recipes(title, image_url, ready_in_minutes, servings, source_url, source_name, recipe_ingredients(id, name, original_text, amount, unit, position))',
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'match-1');
  });

  it('maps recipe joins returned as either objects or single-element arrays', async () => {
    mockQueryState.row = matchRow([recipe]);

    const { result } = renderHook(() => useMatchDetail('match-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.title).toBe('Lemony Pasta');
    });
  });

  it('returns undefined data without an error for a missing row', async () => {
    mockQueryState.row = null;

    const { result } = renderHook(() => useMatchDetail('missing-match'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('surfaces Supabase errors through the query result', async () => {
    mockQueryState.error = { message: 'detail failed' };

    const { result } = renderHook(() => useMatchDetail('match-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe('detail failed');
    });
  });

  it('does not query when matchId is empty', () => {
    const { result } = renderHook(() => useMatchDetail(''), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(result.current).toEqual({ data: undefined, isLoading: false, error: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
