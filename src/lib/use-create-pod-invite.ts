import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Share } from 'react-native';

import { formatInviteCode, inviteLinkFor } from '@/lib/invite-code';
import { createPodInvite, PodRpcError } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';

export function useCreatePodInvite() {
  const { getToken } = useAuth();
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const inviteMutation = useMutation({
    mutationFn: () => createPodInvite(supabase),
    onSuccess: ({ token, expiresAt }) => {
      setInvite({ code: token, expiresAt });
      setHint('Share this code with your partner to pair.');
    },
    onError: (err) => {
      if (err instanceof PodRpcError && err.code === 'already_in_a_pod') {
        setHint('You’re already paired. Reload to see your pod.');
      } else {
        setHint('Couldn’t create an invite. Please try again.');
      }
    },
  });

  const share = useCallback(() => {
    if (!invite) return;
    const link = inviteLinkFor(invite.code);
    Share.share({
      message: `Pair with me on cookDaddy — code ${formatInviteCode(invite.code)}: ${link}`,
      url: link,
    }).catch(() => {});
  }, [invite]);

  return {
    createInvite: inviteMutation.mutate,
    invite,
    share,
    hint,
    isPending: inviteMutation.isPending,
    isError: inviteMutation.isError,
  };
}
