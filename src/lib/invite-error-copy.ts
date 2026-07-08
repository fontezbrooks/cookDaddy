import type { PodRpcErrorCode } from '@/lib/pod-rpcs';

export const INVITE_ERROR_COPY: Record<PodRpcErrorCode, { title: string; body: string }> = {
  invite_not_found: {
    title: 'Invalid invite link',
    body: 'We couldn’t find that invite. Ask your partner to share a new link.',
  },
  invite_expired: {
    title: 'This link expired',
    body: 'Pod invites are good for 24 hours. Ask your partner for a fresh one.',
  },
  invite_already_consumed: {
    title: 'This invite was already used',
    body: 'Someone else has already paired with this link.',
  },
  cannot_consume_own_invite: {
    title: 'That’s your own invite',
    body: 'Share this link with your partner — you can’t pair with yourself.',
  },
  consumer_already_in_a_pod: {
    title: 'You’re already paired',
    body: 'Leave your current pod from Settings before joining a new one.',
  },
  pod_full: {
    title: 'This pod is full',
    body: 'This pod already has two members.',
  },
  already_in_a_pod: {
    title: 'You’re already paired',
    body: 'Leave your current pod from Settings before joining a new one.',
  },
  not_member: {
    title: 'Something went wrong',
    body: 'Please try again.',
  },
  unauthenticated: {
    title: 'Please sign in',
    body: 'You need to be signed in to accept an invite.',
  },
  unknown: {
    title: 'Something went wrong',
    body: 'We couldn’t accept the invite right now. Please try again.',
  },
};
