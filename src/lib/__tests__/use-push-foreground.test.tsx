/* eslint-disable import/first */
import { useAuth } from '@clerk/clerk-expo';
import { renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

const mockGetPermissionsAsync = jest.fn();
const mockCreateSupabaseClient = jest.fn();
const mockTouchPushTokens = jest.fn();
const mockRemove = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
}));

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: (...args: unknown[]) => mockCreateSupabaseClient(...args),
}));

jest.mock('@/lib/push-registration', () => {
  const actual = jest.requireActual('@/lib/push-registration');
  return {
    ...actual,
    touchPushTokens: (...args: unknown[]) => mockTouchPushTokens(...args),
  };
});

import { usePushForeground } from '@/lib/use-push-foreground';

function setSignedIn(): void {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user-1',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

describe('usePushForeground', () => {
  beforeEach(() => {
    mockGetPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
    mockCreateSupabaseClient.mockReset().mockReturnValue({ from: jest.fn() });
    mockTouchPushTokens.mockReset().mockResolvedValue(undefined);
    mockRemove.mockReset();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: mockRemove });
    setSignedIn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing when signed out', async () => {
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: jest.fn(),
      signOut: jest.fn(),
    } as never);

    renderHook(() => usePushForeground());

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockTouchPushTokens).not.toHaveBeenCalled();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });

  it('touches push tokens on mount when signed in and permission is granted', async () => {
    const supabase = { from: jest.fn() };
    mockCreateSupabaseClient.mockReturnValueOnce(supabase);

    renderHook(() => usePushForeground());

    await waitFor(() => {
      expect(mockTouchPushTokens).toHaveBeenCalledWith(supabase, 'user-1');
    });
  });

  it('does not touch tokens when permission is not granted', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

    renderHook(() => usePushForeground());

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockTouchPushTokens).not.toHaveBeenCalled();
  });

  it('registers a foreground listener and removes it on unmount', () => {
    const { unmount } = renderHook(() => usePushForeground());

    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(mockRemove).toHaveBeenCalled();
  });
});
