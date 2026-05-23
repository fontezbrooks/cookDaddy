// Partner-mirroring hook (P6c). Subscribes to the Supabase Realtime channel
// `session:<sessionId>` so the active swipe deck can:
//   • broadcast its own swipe progress / commits (so the partner sees a
//     "swipe whisper" — light haptic + opacity pulse per MATCH-UX §2),
//   • read the partner's most recent commit / progress event off the same
//     channel for mirror rendering.
//
// Self-events round-trip through Supabase Realtime too (it doesn't dedup),
// so the hook stamps every outgoing payload with the caller's Clerk userId
// and filters echoes inbound.

import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createSupabaseClient } from '@/lib/supabase';

import type { SwipeDirection } from '@/lib/session-rpcs';

export type PartnerCommit = {
  recipeId: string;
  direction: SwipeDirection;
};

export type PartnerProgress = {
  recipeId: string;
  fraction: number;
};

export type PartnerMatch = {
  matchId: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
};

export type UseSwipeBroadcastResult = {
  partnerCommit: PartnerCommit | null;
  partnerProgress: PartnerProgress | null;
  partnerMatch: PartnerMatch | null;
  broadcastCommit: (args: { recipeId: string; direction: SwipeDirection }) => Promise<unknown>;
  broadcastProgress: (args: { recipeId: string; fraction: number }) => Promise<unknown>;
  broadcastMatch: (args: PartnerMatch) => Promise<unknown>;
};

type RawCommit = PartnerCommit & { userId: string };
type RawProgress = PartnerProgress & { userId: string };
type RawMatch = PartnerMatch & { userId: string };

export function useSwipeBroadcast(sessionId: string): UseSwipeBroadcastResult {
  const { getToken, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const [partnerCommit, setPartnerCommit] = useState<PartnerCommit | null>(null);
  const [partnerProgress, setPartnerProgress] = useState<PartnerProgress | null>(null);
  const [partnerMatch, setPartnerMatch] = useState<PartnerMatch | null>(null);

  // userIdRef so the inbound handlers always see the latest value without
  // resubscribing the channel each time Clerk re-renders.
  const userIdRef = useRef<string | null>(userId ?? null);
  userIdRef.current = userId ?? null;

  const channelRef = useRef<ReturnType<ReturnType<typeof createSupabaseClient>['channel']> | null>(
    null,
  );

  useEffect(() => {
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('broadcast', { event: 'swipe.commit' }, (evt: { payload: unknown }) => {
        const raw = evt.payload as RawCommit;
        if (!raw || raw.userId === userIdRef.current) return;
        setPartnerCommit({ recipeId: raw.recipeId, direction: raw.direction });
      })
      .on('broadcast', { event: 'swipe.progress' }, (evt: { payload: unknown }) => {
        const raw = evt.payload as RawProgress;
        if (!raw || raw.userId === userIdRef.current) return;
        setPartnerProgress({ recipeId: raw.recipeId, fraction: raw.fraction });
      })
      .on('broadcast', { event: 'match.created' }, (evt: { payload: unknown }) => {
        const raw = evt.payload as RawMatch;
        if (!raw || raw.userId === userIdRef.current) return;
        setPartnerMatch({
          matchId: raw.matchId,
          recipeId: raw.recipeId,
          recipeTitle: raw.recipeTitle,
          recipeImageUrl: raw.recipeImageUrl ?? null,
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, sessionId]);

  const broadcastCommit = useCallback(
    ({ recipeId, direction }: { recipeId: string; direction: SwipeDirection }) => {
      const channel = channelRef.current;
      if (!channel) return Promise.resolve(undefined);
      return channel.send({
        type: 'broadcast',
        event: 'swipe.commit',
        payload: { recipeId, direction, userId: userIdRef.current ?? null },
      });
    },
    [],
  );

  const broadcastProgress = useCallback(
    ({ recipeId, fraction }: { recipeId: string; fraction: number }) => {
      const channel = channelRef.current;
      if (!channel) return Promise.resolve(undefined);
      return channel.send({
        type: 'broadcast',
        event: 'swipe.progress',
        payload: { recipeId, fraction, userId: userIdRef.current ?? null },
      });
    },
    [],
  );

  const broadcastMatch = useCallback((args: PartnerMatch) => {
    const channel = channelRef.current;
    if (!channel) return Promise.resolve(undefined);
    return channel.send({
      type: 'broadcast',
      event: 'match.created',
      payload: { ...args, userId: userIdRef.current ?? null },
    });
  }, []);

  return {
    partnerCommit,
    partnerProgress,
    partnerMatch,
    broadcastCommit,
    broadcastProgress,
    broadcastMatch,
  };
}
