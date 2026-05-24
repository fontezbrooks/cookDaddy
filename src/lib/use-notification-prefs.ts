import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createSupabaseClient } from '@/lib/supabase';

export type NotificationPrefs = {
  matchEnabled: boolean;
  sessionInviteEnabled: boolean;
  podJoinedEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  matchEnabled: true,
  sessionInviteEnabled: true,
  podJoinedEnabled: true,
};

type PrefsRow = {
  match_enabled: boolean;
  session_invite_enabled: boolean;
  pod_joined_enabled: boolean;
};

export async function updateNotificationPrefs(
  supabase: SupabaseClient,
  userId: string,
  prefs: NotificationPrefs,
): Promise<void> {
  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id: userId,
      match_enabled: prefs.matchEnabled,
      session_invite_enabled: prefs.sessionInviteEnabled,
      pod_joined_enabled: prefs.podJoinedEnabled,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
}

export type NotificationPrefKey = keyof NotificationPrefs;

export function useNotificationPrefs(): {
  prefs: NotificationPrefs;
  isLoading: boolean;
  setPref: (key: NotificationPrefKey, value: boolean) => void;
} {
  const { userId, getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notification-prefs', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('match_enabled, session_invite_enabled, pod_joined_enabled')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return DEFAULT_NOTIFICATION_PREFS;
      const row = data as PrefsRow;
      return {
        matchEnabled: row.match_enabled,
        sessionInviteEnabled: row.session_invite_enabled,
        podJoinedEnabled: row.pod_joined_enabled,
      };
    },
  });

  const prefs = query.data ?? DEFAULT_NOTIFICATION_PREFS;

  const mutation = useMutation({
    mutationFn: (next: NotificationPrefs) => updateNotificationPrefs(supabase, userId ?? '', next),
    onMutate: (next) => {
      queryClient.setQueryData(['notification-prefs', userId], next);
    },
  });

  const setPref = (key: NotificationPrefKey, value: boolean) =>
    mutation.mutate({ ...prefs, [key]: value });

  return { prefs, isLoading: query.isLoading, setPref };
}
