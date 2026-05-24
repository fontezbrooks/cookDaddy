import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  DEFAULT_NOTIFICATION_PREFS,
  updateNotificationPrefs,
  useNotificationPrefs,
} from '@/lib/use-notification-prefs';

type PrefsRow = {
  match_enabled: boolean;
  session_invite_enabled: boolean;
  pod_joined_enabled: boolean;
};

const mockQueryState = {
  row: null as PrefsRow | null,
  error: null as { message: string } | null,
  mutationError: null as { message: string } | null,
};

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

const mockClient = {
  from: mockFrom,
};

let activeQueryClient: QueryClient | null = null;

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

function resetSupabaseMock(): void {
  mockQueryState.row = null;
  mockQueryState.error = null;
  mockQueryState.mutationError = null;

  mockMaybeSingle
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ data: mockQueryState.row, error: mockQueryState.error }),
    );
  mockEq.mockReset().mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockSelect.mockReset().mockReturnValue({ eq: mockEq });
  mockUpsert
    .mockReset()
    .mockImplementation(() => Promise.resolve({ error: mockQueryState.mutationError }));
  mockFrom.mockReset().mockReturnValue({ select: mockSelect, upsert: mockUpsert });
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
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
  activeQueryClient = client;
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useNotificationPrefs', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setSignedIn();
  });

  afterEach(() => {
    cleanup();
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('maps a notification_prefs row to camelCase prefs', async () => {
    mockQueryState.row = {
      match_enabled: false,
      session_invite_enabled: true,
      pod_joined_enabled: false,
    };

    const { result } = renderHook(() => useNotificationPrefs(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prefs).toEqual({
      matchEnabled: false,
      sessionInviteEnabled: true,
      podJoinedEnabled: false,
    });
    expect(mockFrom).toHaveBeenCalledWith('notification_prefs');
    expect(mockSelect).toHaveBeenCalledWith(
      'match_enabled, session_invite_enabled, pod_joined_enabled',
    );
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user_alice');
  });

  it('returns default opt-out prefs when no row exists', async () => {
    mockQueryState.row = null;

    const { result } = renderHook(() => useNotificationPrefs(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.prefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('updateNotificationPrefs upserts snake_case columns on user_id conflict', async () => {
    await updateNotificationPrefs(mockClient as unknown as SupabaseClient, 'user_alice', {
      matchEnabled: true,
      sessionInviteEnabled: false,
      podJoinedEnabled: true,
    });

    expect(mockFrom).toHaveBeenCalledWith('notification_prefs');
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user_alice',
        match_enabled: true,
        session_invite_enabled: false,
        pod_joined_enabled: true,
      },
      { onConflict: 'user_id' },
    );
  });

  it('setPref optimistically updates and calls upsert', async () => {
    mockQueryState.row = {
      match_enabled: true,
      session_invite_enabled: true,
      pod_joined_enabled: true,
    };

    const { result } = renderHook(() => useNotificationPrefs(), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.setPref('sessionInviteEnabled', false);

    await waitFor(() =>
      expect(result.current.prefs).toEqual({
        matchEnabled: true,
        sessionInviteEnabled: false,
        podJoinedEnabled: true,
      }),
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user_alice',
        match_enabled: true,
        session_invite_enabled: false,
        pod_joined_enabled: true,
      },
      { onConflict: 'user_id' },
    );
  });
});
