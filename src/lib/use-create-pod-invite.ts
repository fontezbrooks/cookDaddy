import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Share } from 'react-native';

import { createPodInvite, PodRpcError } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';

const INVITE_BASE_URL = 'https://cookdaddy.app/invite/';

export function useCreatePodInvite() {
  const { getToken } = useAuth();
  const [hint, setHint] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const inviteMutation = useMutation({
    mutationFn: () => createPodInvite(supabase),
    onSuccess: async ({ token }) => {
      try {
        await Share.share({
          message: `Pair with me on cookDaddy: ${INVITE_BASE_URL}${token}`,
          url: `${INVITE_BASE_URL}${token}`,
        });
        setHint('Link shared. Waiting for your partner to tap it.');
      } catch {
        setHint('Invite created. Share it anytime from this screen.');
      }
    },
    onError: (err) => {
      if (err instanceof PodRpcError && err.code === 'already_in_a_pod') {
        setHint('You’re already paired. Reload to see your pod.');
      } else {
        setHint('Couldn’t create an invite. Please try again.');
      }
    },
  });

  return {
    createInvite: inviteMutation.mutate,
    hint,
    isPending: inviteMutation.isPending,
    isError: inviteMutation.isError,
  };
}
