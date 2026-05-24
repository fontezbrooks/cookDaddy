import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

import {
  addOrUpdatePantryItem,
  deletePantryItem,
  editPantryItem,
  usePantry,
} from '@/lib/use-pantry';

type PantryRow = {
  id: string;
  name: string;
  name_clean: string | null;
  quantity: number | null;
  unit: string | null;
  expires_at: string | null;
  updated_by_user_id: string;
};

type MutationResult = Promise<{ error: { message: string } | null }>;

const mockQueryState = {
  rows: [] as PantryRow[] | null,
  error: null as { message: string } | null,
  mutationError: null as { message: string } | null,
};

const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();
const mockOn = jest.fn();
const mockSubscribe = jest.fn();
const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();

const mockRealtimeChannel = {
  on: mockOn,
  subscribe: mockSubscribe,
};

const mockClient = {
  from: mockFrom,
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
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
  mockEq.mockReset().mockImplementation(() => ({ order: mockOrder }));
  mockSelect.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockUpdate.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockDelete.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockUpsert.mockReset().mockImplementation(() => mutationResult());
  mockFrom.mockReset().mockReturnValue({
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
    upsert: mockUpsert,
  });
  mockOn.mockReset().mockReturnValue(mockRealtimeChannel);
  mockSubscribe.mockReset().mockReturnValue(mockRealtimeChannel);
  mockChannel.mockReset().mockReturnValue(mockRealtimeChannel);
  mockRemoveChannel.mockReset();
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

const rows: PantryRow[] = [
  {
    id: 'pantry-1',
    name: 'Olive Oil',
    name_clean: 'olive oil',
    quantity: 1,
    unit: 'bottle',
    expires_at: null,
    updated_by_user_id: 'user_alice',
  },
  {
    id: 'pantry-2',
    name: 'Tomatoes',
    name_clean: 'tomato',
    quantity: 4,
    unit: null,
    expires_at: '2026-06-01',
    updated_by_user_id: 'user_bob',
  },
];

describe('usePantry', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    resetSupabaseMock();
    setSignedIn();
  });

  it('maps rows to PantryItem objects', async () => {
    setActivePod();
    mockQueryState.rows = rows;

    const { result } = renderHook(() => usePantry(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([
      {
        id: 'pantry-1',
        name: 'Olive Oil',
        nameClean: 'olive oil',
        quantity: 1,
        unit: 'bottle',
        expiresAt: null,
        updatedByUserId: 'user_alice',
      },
      {
        id: 'pantry-2',
        name: 'Tomatoes',
        nameClean: 'tomato',
        quantity: 4,
        unit: null,
        expiresAt: '2026-06-01',
        updatedByUserId: 'user_bob',
      },
    ]);
    expect(mockSelect).toHaveBeenCalledWith(
      'id, name, name_clean, quantity, unit, expires_at, updated_by_user_id',
    );
    expect(mockEq).toHaveBeenCalledWith('pod_id', 'pod-1');
    expect(mockOrder).toHaveBeenCalledWith('name');
  });

  it('returns empty data and does not query when there is no active pod', () => {
    const { result } = renderHook(() => usePantry(), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(result.current).toEqual({ data: [], isLoading: false, error: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('subscribes to pod pantry realtime and removes the channel on unmount', () => {
    setActivePod();

    const { unmount } = renderHook(() => usePantry(), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(mockChannel).toHaveBeenCalledWith('pod-pantry:pod-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pantry_items',
        filter: 'pod_id=eq.pod-1',
      },
      expect.any(Function),
    );
    expect(mockSubscribe).toHaveBeenCalled();

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockRealtimeChannel);
  });
});

describe('pantry mutation helpers', () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it('addOrUpdatePantryItem upserts a cleaned item with conflict target', async () => {
    await addOrUpdatePantryItem(mockClient as unknown as SupabaseClient, {
      podId: 'pod-1',
      updatedByUserId: 'user_alice',
      name: 'Olive Oils',
      quantity: 2,
      unit: 'bottles',
      expiresAt: '2026-06-01',
    });

    expect(mockFrom).toHaveBeenCalledWith('pantry_items');
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        pod_id: 'pod-1',
        name: 'Olive Oils',
        name_clean: 'olive oil',
        quantity: 2,
        unit: 'bottles',
        expires_at: '2026-06-01',
        updated_by_user_id: 'user_alice',
      },
      { onConflict: 'pod_id,name_clean' },
    );
  });

  it('editPantryItem updates by id and refreshes name_clean when name changes', async () => {
    await editPantryItem(mockClient as unknown as SupabaseClient, 'pantry-1', {
      name: 'Tomatoes',
      quantity: null,
      unit: 'cans',
      expiresAt: null,
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      name: 'Tomatoes',
      name_clean: 'tomato',
      quantity: null,
      unit: 'cans',
      expires_at: null,
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'pantry-1');
  });

  it('deletePantryItem deletes by id', async () => {
    await deletePantryItem(mockClient as unknown as SupabaseClient, 'pantry-1');

    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'pantry-1');
  });
});
