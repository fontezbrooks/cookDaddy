import type { PushEvent } from './fan-out-push';

export type AnalyticsCapture = {
  distinctId: string;
  event: 'pod_invite_consumed' | 'session_started';
  properties: Record<string, unknown>;
  groups?: { pod: string };
};

function parseDateString(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function timeToConsumeMin(record: Record<string, unknown>): number | null {
  const createdAt = parseDateString(record.created_at);
  const consumedAt = parseDateString(record.consumed_at);
  if (createdAt === null || consumedAt === null) return null;
  return Math.round((consumedAt - createdAt) / 60000);
}

export function buildAnalyticsEvents(
  event: PushEvent,
  record: Record<string, unknown>,
): AnalyticsCapture[] {
  switch (event.kind) {
    case 'pod_joined': {
      const minutes = timeToConsumeMin(record);
      return [
        {
          distinctId: event.consumerUserId,
          event: 'pod_invite_consumed',
          properties: {
            pod_id: event.podId,
            inviter_user_id: event.inviterUserId,
            consumer_user_id: event.consumerUserId,
            ...(minutes === null ? {} : { time_to_consume_min: minutes }),
          },
          groups: { pod: event.podId },
        },
      ];
    }
    case 'session_invited':
      return [
        {
          distinctId: event.startedBy,
          event: 'session_started',
          properties: {
            session_id: event.sessionId,
            pod_id: event.podId,
            deck_size: Array.isArray(record.deck_recipe_ids) ? record.deck_recipe_ids.length : 0,
          },
          groups: { pod: event.podId },
        },
      ];
    case 'match':
    case 'ignored':
      return [];
  }
}
