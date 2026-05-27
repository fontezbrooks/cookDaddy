import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { buildIngredientAisleMap, useIngredientAisleMap } from '@/lib/use-ingredient-aisle-map';

type IngredientAisleRow = {
  name_clean: string | null;
  aisle: string | null;
};

const mockRows = {
  data: [] as IngredientAisleRow[] | null,
  error: null as { message: string } | null,
};

const mockLimit = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockClient = { from: mockFrom };

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

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

describe('buildIngredientAisleMap', () => {
  it('picks the modal aisle and breaks ties alphabetically', () => {
    const aisleMap = buildIngredientAisleMap([
      { name_clean: 'apple', aisle: 'Produce' },
      { name_clean: 'apple', aisle: 'Produce' },
      { name_clean: 'apple', aisle: 'Snacks' },
      { name_clean: 'salt', aisle: 'Spices' },
      { name_clean: 'salt', aisle: 'Baking' },
    ]);

    expect(aisleMap).toBeInstanceOf(Map);
    expect(aisleMap.get('apple')).toBe('Produce');
    expect(aisleMap.get('salt')).toBe('Baking');
  });

  it('ignores null and empty name_clean or aisle values', () => {
    const aisleMap = buildIngredientAisleMap([
      { name_clean: null, aisle: 'Produce' },
      { name_clean: '', aisle: 'Produce' },
      { name_clean: 'milk', aisle: null },
      { name_clean: 'milk', aisle: '' },
      { name_clean: 'milk', aisle: 'Dairy' },
    ]);

    expect([...aisleMap.entries()]).toEqual([['milk', 'Dairy']]);
  });
});

describe('useIngredientAisleMap', () => {
  beforeEach(() => {
    mockRows.data = [];
    mockRows.error = null;
    mockLimit
      .mockReset()
      .mockImplementation(() => Promise.resolve({ data: mockRows.data, error: mockRows.error }));
    mockSelect.mockReset().mockReturnValue({ limit: mockLimit });
    mockFrom.mockReset().mockReturnValue({ select: mockSelect });
    setSignedIn();
  });

  it('queries recipe ingredients and returns a Map', async () => {
    mockRows.data = [
      { name_clean: 'egg', aisle: 'Dairy' },
      { name_clean: 'egg', aisle: 'Dairy' },
      { name_clean: 'egg', aisle: 'Protein' },
    ];

    const { result } = renderHook(() => useIngredientAisleMap(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('recipe_ingredients');
    expect(mockSelect).toHaveBeenCalledWith('name_clean, aisle');
    expect(mockLimit).toHaveBeenCalledWith(50000);
    expect(result.current.data).toBeInstanceOf(Map);
    expect(result.current.data.get('egg')).toBe('Dairy');
    expect(result.current.error).toBeNull();
  });

  it('returns an empty Map when the limited query returns null data', async () => {
    mockRows.data = null;

    const { result } = renderHook(() => useIngredientAisleMap(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockLimit).toHaveBeenCalledWith(50000);
    expect([...result.current.data.entries()]).toEqual([]);
  });

  it('surfaces query errors', async () => {
    mockRows.error = { message: 'aisle fetch failed' };

    const { result } = renderHook(() => useIngredientAisleMap(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('aisle fetch failed');
  });
});
