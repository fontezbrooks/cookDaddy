import type { SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

function supportedPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

// Requests the OS permission. Returns true iff granted.
export async function requestPushPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Registers (or refreshes) this device's Expo push token for the user. No-op
// returning null when permission isn't granted or the platform is unsupported.
// Upserts on the expo_token PK so re-registration just refreshes last_seen.
export async function registerPushToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const platform = supportedPlatform();
  if (!platform) return null;
  if ((await getPushPermissionStatus()) !== 'granted') return null;

  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
    ?.projectId;
  const { data: tokenData } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const expoToken =
    typeof tokenData === 'string' ? tokenData : (tokenData as { data?: string } | undefined)?.data;
  if (!expoToken) return null;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_token: expoToken,
      platform,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'expo_token' },
  );
  if (error) throw new Error(error.message);
  return expoToken;
}

// Bumps last_seen for all of the user's tokens (DESIGN §9.4 foreground touch)
// without re-fetching the Expo token.
export async function touchPushTokens(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .update({ last_seen: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
