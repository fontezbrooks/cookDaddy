/* eslint-disable import/first */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
let mockPlatformOS = 'ios';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: { projectId: 'project-123' },
      },
    },
  },
}));

import {
  getPushPermissionStatus,
  registerPushToken,
  requestPushPermission,
  touchPushTokens,
} from '@/lib/push-registration';

type SupabaseMock = {
  from: jest.Mock;
  upsert: jest.Mock;
  update: jest.Mock;
  eq: jest.Mock;
};

function createSupabaseMock(): SupabaseMock {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ upsert, update });
  return { from, upsert, update, eq };
}

describe('push registration helpers', () => {
  beforeEach(() => {
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockGetExpoPushTokenAsync.mockReset();
    mockPlatformOS = 'ios';
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => mockPlatformOS,
    });
  });

  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['undetermined', 'undetermined'],
    ['limited', 'undetermined'],
  ] as const)('maps %s permission status to %s', async (status, expected) => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status });

    await expect(getPushPermissionStatus()).resolves.toBe(expected);
  });

  it('returns true only when the permission request is granted', async () => {
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    await expect(requestPushPermission()).resolves.toBe(true);

    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await expect(requestPushPermission()).resolves.toBe(false);
  });

  it('does not upsert a token when permission is not granted', async () => {
    const supabase = createSupabaseMock();
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

    await expect(
      registerPushToken(supabase as unknown as SupabaseClient, 'user-1'),
    ).resolves.toBeNull();

    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it('registers an Expo token for the signed-in user on iOS', async () => {
    const supabase = createSupabaseMock();
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({
      data: { data: 'ExponentPushToken[abc]' },
    });

    await expect(registerPushToken(supabase as unknown as SupabaseClient, 'user-1')).resolves.toBe(
      'ExponentPushToken[abc]',
    );

    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-123' });
    expect(supabase.from).toHaveBeenCalledWith('push_tokens');
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        expo_token: 'ExponentPushToken[abc]',
        platform: 'ios',
        last_seen: expect.any(String),
      }),
      { onConflict: 'expo_token' },
    );
  });

  it('returns null on unsupported platforms without fetching a token', async () => {
    const supabase = createSupabaseMock();
    mockPlatformOS = 'web';

    await expect(
      registerPushToken(supabase as unknown as SupabaseClient, 'user-1'),
    ).resolves.toBeNull();

    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it('throws when the token upsert fails', async () => {
    const supabase = createSupabaseMock();
    supabase.upsert.mockResolvedValueOnce({ error: { message: 'rls denied' } });
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({
      data: { data: 'ExponentPushToken[abc]' },
    });

    await expect(
      registerPushToken(supabase as unknown as SupabaseClient, 'user-1'),
    ).rejects.toThrow('rls denied');
  });

  it('touches all tokens for the user', async () => {
    const supabase = createSupabaseMock();

    await touchPushTokens(supabase as unknown as SupabaseClient, 'user-1');

    expect(supabase.from).toHaveBeenCalledWith('push_tokens');
    expect(supabase.update).toHaveBeenCalledWith({ last_seen: expect.any(String) });
    expect(supabase.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
