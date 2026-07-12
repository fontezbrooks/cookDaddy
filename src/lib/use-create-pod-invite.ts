import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Share } from 'react-native';

import { formatInviteCode, inviteLinkFor } from '@/lib/invite-code';
import { createPodInvite, PodRpcError } from '@/lib/pod-rpcs';
import { createSupabaseClient } from '@/lib/supabase';

export function useCreatePodInvite() {
  const { userId, getToken } = useAuth();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const inviteMutation = useMutation({
    mutationFn: () => createPodInvite(supabase),
    onSuccess: ({ token, expiresAt }) => {
      setInvite({ code: token, expiresAt });
      setHint('Share this code with your partner to pair.');
      // create_pod_invite creates the inviter's solo pod_members row, so nudge
      // usePodSync to reconcile (Home reflects the pending solo pod and can flip to paired
      // once the partner joins without waiting for an AppState foreground).
      queryClient.invalidateQueries({ queryKey: ['pod-membership', userId] });
    },
    onError: (err) => {
      if (err instanceof PodRpcError && err.code === 'already_in_a_pod') {
        // Self-heal (FR-3): the server says a pod exists, so refetch the
        // membership instead of asking the user to reload.
        setHint('You’re already paired — refreshing your pod…');
        queryClient.invalidateQueries({ queryKey: ['pod-membership', userId] });
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
