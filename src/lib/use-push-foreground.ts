import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useMemo } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getPushPermissionStatus, touchPushTokens } from '@/lib/push-registration';
import { createSupabaseClient } from '@/lib/supabase';

// Bumps push_tokens.last_seen for the signed-in user on mount + each foreground
// transition, gated on an already-granted permission. Registration itself
// happens via the P11-S3 priming flow; this only keeps tokens warm.
export function usePushForeground(): void {
  const { isSignedIn, userId, getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  useEffect(() => {
    if (!isSignedIn || !userId) return undefined;

    let cancelled = false;
    const touch = async () => {
      if ((await getPushPermissionStatus()) !== 'granted') return;
      if (cancelled) return;
      await touchPushTokens(supabase, userId).catch(() => undefined);
    };

    void touch();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void touch();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [isSignedIn, userId, supabase]);
}
