/**
 * Cookbook data-layer contract (P9 Slice 1). Matched recipes are fetched
 * through the matches -> recipes join, normalized into screen-ready entries,
 * then filtered client-side so the filter semantics stay deterministic and
 * easy to test without depending on PostgREST query shape.
 */

import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

import {
  markCooked,
  removeFromCookbook,
  restoreToCookbook,
  usePodMatchCount,
  usePodMatches,
} from '@/lib/use-pod-matches';

type RecipeRow = {
  id: string;
  title: string;
  image_url: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
};

type MatchRow = {
  id: string;
  recipe_id: string;
  matched_at: string;
  cooked_at: string | null;
  removed_at: string | null;
  recipes: RecipeRow | RecipeRow[] | null;
};

const mockQueryState = {
  rows: [] as MatchRow[] | null,
  error: null as { message: string } | null,
  count: 0 as number | null,
  countError: null as { message: string } | null,
  updateError: null as { message: string } | null,
};

const mockOrder = jest.fn();
const mockIs = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockFrom = jest.fn();

const mockClient = {
  from: mockFrom,
};

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

function resetSupabaseMock(): void {
  mockQueryState.rows = [];
  mockQueryState.error = null;
  mockQueryState.count = 0;
  mockQueryState.countError = null;
  mockQueryState.updateError = null;

  mockOrder
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ data: mockQueryState.rows, error: mockQueryState.error }),
    );
  mockIs
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ count: mockQueryState.count, error: mockQueryState.countError }),
    );
  mockEq.mockReset().mockImplementation(() => ({ order: mockOrder, is: mockIs }));
  mockSelect.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockUpdate.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockFrom.mockReset().mockImplementation(() => ({ select: mockSelect, update: mockUpdate }));
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

function setActivePod(): void {
  usePodStore.getState().setActivePod({
    podId: 'pod-1',
    partnerId: 'user_bob',
    partnerDisplayName: 'Bob',
  });
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const recipeA: RecipeRow = {
  id: 'recipe-a',
  title: 'Aglio e Olio',
  image_url: 'https://example.test/a.jpg',
  ready_in_minutes: 20,
  servings: 2,
};

const recipeB: RecipeRow = {
  id: 'recipe-b',
  title: 'Bean Chili',
  image_url: null,
  ready_in_minutes: 45,
  servings: 4,
};

const recipeC: RecipeRow = {
  id: 'recipe-c',
  title: 'Curry',
  image_url: 'https://example.test/c.jpg',
  ready_in_minutes: null,
  servings: null,
};

function baseRows(): MatchRow[] {
  return [
    {
      id: 'match-cooked',
      recipe_id: 'recipe-a',
      matched_at: '2026-05-23T12:00:00.000Z',
      cooked_at: '2026-05-23T13:00:00.000Z',
      removed_at: null,
      recipes: recipeA,
    },
    {
      id: 'match-unattempted',
      recipe_id: 'recipe-b',
      matched_at: '2026-05-22T12:00:00.000Z',
      cooked_at: null,
      removed_at: null,
      recipes: [recipeB],
    },
    {
      id: 'match-removed',
      recipe_id: 'recipe-c',
      matched_at: '2026-05-21T12:00:00.000Z',
      cooked_at: null,
      removed_at: '2026-05-21T13:00:00.000Z',
      recipes: recipeC,
    },
  ];
}

describe('usePodMatches', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    resetSupabaseMock();
    setSignedIn();
  });

  it("returns mapped entries in matched_at order for 'all' and excludes removed rows", async () => {
    setActivePod();
    setRows(baseRows());

    const { result } = renderHook(() => usePodMatches(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([
      {
        matchId: 'match-cooked',
        recipeId: 'recipe-a',
        title: 'Aglio e Olio',
        imageUrl: 'https://example.test/a.jpg',
        readyInMinutes: 20,
        servings: 2,
        matchedAt: '2026-05-23T12:00:00.000Z',
        cookedAt: '2026-05-23T13:00:00.000Z',
        removedAt: null,
      },
      {
        matchId: 'match-unattempted',
        recipeId: 'recipe-b',
        title: 'Bean Chili',
        imageUrl: null,
        readyInMinutes: 45,
        servings: 4,
        matchedAt: '2026-05-22T12:00:00.000Z',
        cookedAt: null,
        removedAt: null,
      },
    ]);
    expect(mockSelect).toHaveBeenCalledWith(
      'id, recipe_id, matched_at, cooked_at, removed_at, recipes(id, title, image_url, ready_in_minutes, servings)',
    );
    expect(mockEq).toHaveBeenCalledWith('pod_id', 'pod-1');
    expect(mockOrder).toHaveBeenCalledWith('matched_at', { ascending: false });
  });

  it("filters 'cooked' to cooked and not removed rows", async () => {
    setActivePod();
    setRows(baseRows());

    const { result } = renderHook(() => usePodMatches('cooked'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.map((entry) => entry.matchId)).toEqual(['match-cooked']);
    });
  });

  it("filters 'unattempted' to rows without cooked_at or removed_at", async () => {
    setActivePod();
    setRows(baseRows());

    const { result } = renderHook(() => usePodMatches('unattempted'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.map((entry) => entry.matchId)).toEqual(['match-unattempted']);
    });
  });

  it("filters 'removed' to removed rows", async () => {
    setActivePod();
    setRows(baseRows());

    const { result } = renderHook(() => usePodMatches('removed'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.map((entry) => entry.matchId)).toEqual(['match-removed']);
    });
  });

  it('maps recipe joins returned as either objects or single-element arrays', async () => {
    setActivePod();
    const rows = baseRows();
    setRows([
      { ...rows[0]!, recipes: recipeA },
      { ...rows[1]!, recipes: [recipeB] },
    ]);

    const { result } = renderHook(() => usePodMatches(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.map((entry) => entry.title)).toEqual([
        'Aglio e Olio',
        'Bean Chili',
      ]);
    });
  });

  it('skips rows with missing recipe joins', async () => {
    setActivePod();
    const rows = baseRows();
    setRows([{ ...rows[0]!, recipes: null }, rows[1]!]);

    const { result } = renderHook(() => usePodMatches(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.map((entry) => entry.matchId)).toEqual(['match-unattempted']);
    });
  });

  it('returns an empty array and never queries when there is no active pod', async () => {
    const { result } = renderHook(() => usePodMatches(), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(result.current).toEqual({ data: [], isLoading: false, error: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('surfaces Supabase errors through the query result', async () => {
    setActivePod();
    mockQueryState.error = { message: 'read failed' };

    const { result } = renderHook(() => usePodMatches(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe('read failed');
    });
  });
});

describe('usePodMatchCount', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    resetSupabaseMock();
    setSignedIn();
  });

  it('counts active non-removed matches for the active pod', async () => {
    setActivePod();
    mockQueryState.count = 7;

    const { result } = renderHook(() => usePodMatchCount(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current).toEqual({ count: 7, isLoading: false });
    });
    expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(mockEq).toHaveBeenCalledWith('pod_id', 'pod-1');
    expect(mockIs).toHaveBeenCalledWith('removed_at', null);
  });

  it('returns zero and never queries when there is no active pod', () => {
    const { result } = renderHook(() => usePodMatchCount(), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(result.current).toEqual({ count: 0, isLoading: false });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('cookbook mutation helpers', () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it('markCooked sets cooked_at for the match id', async () => {
    await markCooked(mockClient as unknown as SupabaseClient, 'match-1');

    expect(mockFrom).toHaveBeenCalledWith('matches');
    expect(mockUpdate).toHaveBeenCalledWith({ cooked_at: expect.any(String) });
    expect(mockEq).toHaveBeenCalledWith('id', 'match-1');
  });

  it('removeFromCookbook sets removed_at for the match id', async () => {
    await removeFromCookbook(mockClient as unknown as SupabaseClient, 'match-1');

    expect(mockFrom).toHaveBeenCalledWith('matches');
    expect(mockUpdate).toHaveBeenCalledWith({ removed_at: expect.any(String) });
    expect(mockEq).toHaveBeenCalledWith('id', 'match-1');
  });

  it('restoreToCookbook clears removed_at for the match id', async () => {
    await restoreToCookbook(mockClient as unknown as SupabaseClient, 'match-1');

    expect(mockFrom).toHaveBeenCalledWith('matches');
    expect(mockUpdate).toHaveBeenCalledWith({ removed_at: null });
    expect(mockEq).toHaveBeenCalledWith('id', 'match-1');
  });

  it('throws when a mutation returns an error', async () => {
    mockQueryState.updateError = { message: 'update failed' };
    mockEq.mockImplementation(() => Promise.resolve({ error: mockQueryState.updateError }));

    await expect(markCooked(mockClient as unknown as SupabaseClient, 'match-1')).rejects.toThrow(
      'update failed',
    );
  });
});
