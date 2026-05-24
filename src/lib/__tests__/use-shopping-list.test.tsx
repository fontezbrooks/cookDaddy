import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

import {
  addShoppingItemsFromRecipe,
  addShoppingItem,
  clearChecked,
  moveToPantry,
  toggleChecked,
  useShoppingList,
} from '@/lib/use-shopping-list';

type ShoppingRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  source_recipe_id: string | null;
  added_by_user_id: string;
  checked_at: string | null;
  created_at: string;
};

type MutationResult = Promise<{ error: { message: string } | null }>;

const mockQueryState = {
  rows: [] as ShoppingRow[] | null,
  error: null as { message: string } | null,
  mutationError: null as { message: string } | null,
};

const mockOrder = jest.fn();
const mockNot = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();
const mockOn = jest.fn();
const mockSubscribe = jest.fn();
const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();
const mockRpc = jest.fn();

const mockRealtimeChannel = {
  on: mockOn,
  subscribe: mockSubscribe,
};

const mockClient = {
  from: mockFrom,
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
  rpc: mockRpc,
};

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

function mutationResult(): MutationResult {
  return Promise.resolve({ error: mockQueryState.mutationError });
}

function resetSupabaseMock(): void {
  mockQueryState.rows = [];
  mockQueryState.error = null;
  mockQueryState.mutationError = null;

  mockOrder
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ data: mockQueryState.rows, error: mockQueryState.error }),
    );
  mockNot.mockReset().mockImplementation(() => mutationResult());
  mockEq.mockReset().mockImplementation(() => ({ order: mockOrder, not: mockNot }));
  mockSelect.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockInsert.mockReset().mockImplementation(() => mutationResult());
  mockUpdate.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockDelete.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockUpsert.mockReset().mockImplementation(() => mutationResult());
  mockFrom.mockReset().mockImplementation((table: string) => {
    if (table === 'pantry_items') return { upsert: mockUpsert };
    return {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    };
  });
  mockOn.mockReset().mockReturnValue(mockRealtimeChannel);
  mockSubscribe.mockReset().mockReturnValue(mockRealtimeChannel);
  mockChannel.mockReset().mockReturnValue(mockRealtimeChannel);
  mockRemoveChannel.mockReset();
  mockRpc
    .mockReset()
    .mockResolvedValue({ data: { inserted_count: 0, pantry_conflicts: [] }, error: null });
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

const rows: ShoppingRow[] = [
  {
    id: 'item-1',
    name: 'Olive Oil',
    quantity: 1,
    unit: 'bottle',
    category: 'pantry',
    source_recipe_id: 'recipe-1',
    added_by_user_id: 'user_alice',
    checked_at: null,
    created_at: '2026-05-23T12:00:00.000Z',
  },
  {
    id: 'item-2',
    name: 'Tomatoes',
    quantity: 4,
    unit: null,
    category: null,
    source_recipe_id: null,
    added_by_user_id: 'user_bob',
    checked_at: '2026-05-23T13:00:00.000Z',
    created_at: '2026-05-23T12:05:00.000Z',
  },
];

describe('useShoppingList', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    resetSupabaseMock();
    setSignedIn();
  });

  it('maps rows to ShoppingItem objects', async () => {
    setActivePod();
    mockQueryState.rows = rows;

    const { result } = renderHook(() => useShoppingList(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([
      {
        id: 'item-1',
        name: 'Olive Oil',
        quantity: 1,
        unit: 'bottle',
        category: 'pantry',
        sourceRecipeId: 'recipe-1',
        addedByUserId: 'user_alice',
        checkedAt: null,
        createdAt: '2026-05-23T12:00:00.000Z',
      },
      {
        id: 'item-2',
        name: 'Tomatoes',
        quantity: 4,
        unit: null,
        category: null,
        sourceRecipeId: null,
        addedByUserId: 'user_bob',
        checkedAt: '2026-05-23T13:00:00.000Z',
        createdAt: '2026-05-23T12:05:00.000Z',
      },
    ]);
    expect(mockSelect).toHaveBeenCalledWith(
      'id, name, quantity, unit, category, source_recipe_id, added_by_user_id, checked_at, created_at',
    );
    expect(mockEq).toHaveBeenCalledWith('pod_id', 'pod-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at');
  });

  it('returns empty data and does not query when there is no active pod', () => {
    const { result } = renderHook(() => useShoppingList(), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(result.current).toEqual({ data: [], isLoading: false, error: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('subscribes to pod shopping realtime and removes the channel on unmount', () => {
    setActivePod();

    const { unmount } = renderHook(() => useShoppingList(), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(mockChannel).toHaveBeenCalledWith('pod-shopping:pod-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shopping_list_items',
        filter: 'pod_id=eq.pod-1',
      },
      expect.any(Function),
    );
    expect(mockSubscribe).toHaveBeenCalled();

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockRealtimeChannel);
  });
});

describe('shopping list mutation helpers', () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it('addShoppingItem inserts the expected payload', async () => {
    await addShoppingItem(mockClient as unknown as SupabaseClient, {
      podId: 'pod-1',
      addedByUserId: 'user_alice',
      name: 'Olive Oil',
      quantity: 1,
      unit: 'bottle',
      category: 'pantry',
    });

    expect(mockFrom).toHaveBeenCalledWith('shopping_list_items');
    expect(mockInsert).toHaveBeenCalledWith({
      pod_id: 'pod-1',
      added_by_user_id: 'user_alice',
      name: 'Olive Oil',
      quantity: 1,
      unit: 'bottle',
      category: 'pantry',
    });
  });

  it('toggleChecked sets checked_at to a timestamp when currently unchecked', async () => {
    await toggleChecked(mockClient as unknown as SupabaseClient, {
      id: 'item-1',
      checkedAt: null,
    });

    expect(mockUpdate).toHaveBeenCalledWith({ checked_at: expect.any(String) });
    expect(mockEq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('toggleChecked clears checked_at when currently checked', async () => {
    await toggleChecked(mockClient as unknown as SupabaseClient, {
      id: 'item-1',
      checkedAt: '2026-05-23T12:00:00.000Z',
    });

    expect(mockUpdate).toHaveBeenCalledWith({ checked_at: null });
    expect(mockEq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('clearChecked deletes checked rows for a pod', async () => {
    await clearChecked(mockClient as unknown as SupabaseClient, 'pod-1');

    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('pod_id', 'pod-1');
    expect(mockNot).toHaveBeenCalledWith('checked_at', 'is', null);
  });

  it('moveToPantry upserts a cleaned pantry item and deletes the shopping row', async () => {
    await moveToPantry(mockClient as unknown as SupabaseClient, {
      podId: 'pod-1',
      name: 'Olive Oils',
      quantity: 2,
      unit: 'bottles',
      updatedByUserId: 'user_alice',
      shoppingItemId: 'item-1',
    });

    expect(mockFrom).toHaveBeenCalledWith('pantry_items');
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        pod_id: 'pod-1',
        name: 'Olive Oils',
        name_clean: 'olive oil',
        quantity: 2,
        unit: 'bottles',
        updated_by_user_id: 'user_alice',
      },
      { onConflict: 'pod_id,name_clean' },
    );
    expect(mockFrom).toHaveBeenCalledWith('shopping_list_items');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'item-1');
  });
});

describe('addShoppingItemsFromRecipe', () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it('calls the rpc and maps the result', async () => {
    mockRpc.mockResolvedValue({
      data: { inserted_count: 2, pantry_conflicts: ['Yellow Onion'] },
      error: null,
    });

    const result = await addShoppingItemsFromRecipe(mockClient as unknown as SupabaseClient, {
      podId: 'pod-1',
      recipeId: 'r1',
      ingredientIds: ['ing-1', 'ing-2'],
    });

    expect(mockRpc).toHaveBeenCalledWith('add_shopping_items_from_recipe', {
      p_pod_id: 'pod-1',
      p_recipe_id: 'r1',
      p_ingredient_ids: ['ing-1', 'ing-2'],
    });
    expect(result).toEqual({ insertedCount: 2, pantryConflicts: ['Yellow Onion'] });
  });

  it('defaults missing fields to 0/[]', async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await expect(
      addShoppingItemsFromRecipe(mockClient as unknown as SupabaseClient, {
        podId: 'pod-1',
        recipeId: 'r1',
        ingredientIds: ['ing-1'],
      }),
    ).resolves.toEqual({ insertedCount: 0, pantryConflicts: [] });
  });

  it('throws on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(
      addShoppingItemsFromRecipe(mockClient as unknown as SupabaseClient, {
        podId: 'pod-1',
        recipeId: 'r1',
        ingredientIds: ['ing-1'],
      }),
    ).rejects.toThrow('boom');
  });
});
