// Pure logic for the push fan-out Edge Function.
//
// The Deno entry in supabase/functions/fan-out-push/index.ts is a thin wrapper:
// it verifies the shared secret, classifies the Supabase DB-webhook payload,
// resolves recipients + their tokens + display data + per-type opt-outs from
// Postgres, then defers to buildExpoMessages here. Everything in this file is
// environment-agnostic so Jest can exercise it directly.
//
// Source spec: docs/DESIGN/README.md §9 (§9.2 triggers, §9.3 payload) + §16.2.

export class WebhookPayloadError extends Error {
  override readonly name = 'WebhookPayloadError';
}

// Supabase Database Webhook payload shape.
export type DbWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

export type PushEvent =
  | { kind: 'match'; podId: string; recipeId: string; matchId: string; sessionId: string }
  | { kind: 'pod_joined'; podId: string; inviterUserId: string; consumerUserId: string }
  | { kind: 'session_invited'; podId: string; sessionId: string; startedBy: string }
  | { kind: 'ignored' };

// A recipient resolved by the Deno wrapper: their Expo tokens + whether the
// relevant per-type pref is enabled (defaults true when no prefs row exists).
export type Recipient = {
  userId: string;
  tokens: string[];
  prefEnabled: boolean;
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
  priority: 'high';
  ttl: number;
};

export type BuildInput =
  | {
      kind: 'match';
      podId: string;
      recipeId: string;
      matchId: string;
      recipeTitle: string;
      recipients: Recipient[];
    }
  | { kind: 'pod_joined'; podId: string; joinerName: string; recipients: Recipient[] }
  | {
      kind: 'session_invited';
      podId: string;
      sessionId: string;
      starterName: string;
      recipients: Recipient[];
    };

const TTL_SECONDS = 3600;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function reqString(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new WebhookPayloadError(`webhook record.${key} missing`);
  }
  return v;
}

// Classify a verified DB-webhook payload into a push event. Unknown shapes that
// we do not act on collapse to { kind: 'ignored' }; structurally malformed
// payloads throw WebhookPayloadError.
export function classifyWebhook(payload: unknown): PushEvent {
  if (!isObject(payload) || typeof payload.type !== 'string' || typeof payload.table !== 'string') {
    throw new WebhookPayloadError('payload missing type/table');
  }
  const { type, table } = payload as DbWebhookPayload;
  const record = isObject((payload as DbWebhookPayload).record)
    ? ((payload as DbWebhookPayload).record as Record<string, unknown>)
    : null;
  const oldRecord = isObject((payload as DbWebhookPayload).old_record)
    ? ((payload as DbWebhookPayload).old_record as Record<string, unknown>)
    : null;

  if (table === 'matches' && type === 'INSERT' && record) {
    return {
      kind: 'match',
      podId: reqString(record, 'pod_id'),
      recipeId: reqString(record, 'recipe_id'),
      matchId: reqString(record, 'id'),
      sessionId: reqString(record, 'session_id'),
    };
  }

  if (table === 'pod_invites' && type === 'UPDATE' && record) {
    const consumedNow = typeof record.consumed_at === 'string' && record.consumed_at.length > 0;
    const consumedBefore =
      !!oldRecord && typeof oldRecord.consumed_at === 'string' && oldRecord.consumed_at.length > 0;
    if (consumedNow && !consumedBefore) {
      return {
        kind: 'pod_joined',
        podId: reqString(record, 'pod_id'),
        inviterUserId: reqString(record, 'inviter_user_id'),
        consumerUserId: reqString(record, 'consumed_by'),
      };
    }
    return { kind: 'ignored' };
  }

  if (table === 'sessions' && type === 'INSERT' && record) {
    if (record.status === 'lobby') {
      return {
        kind: 'session_invited',
        podId: reqString(record, 'pod_id'),
        sessionId: reqString(record, 'id'),
        startedBy: reqString(record, 'started_by'),
      };
    }
    return { kind: 'ignored' };
  }

  return { kind: 'ignored' };
}

// Build the Expo push messages for an event. One message per token, skipping
// recipients whose per-type pref is disabled or who have no tokens. Copy follows
// DESIGN §9.2; payload shape follows §9.3.
export function buildExpoMessages(input: BuildInput): ExpoPushMessage[] {
  const deliverable = input.recipients.filter((r) => r.prefEnabled && r.tokens.length > 0);

  let title: string;
  let body: string;
  let data: Record<string, string>;

  switch (input.kind) {
    case 'match':
      title = "It's a match! 🎉";
      body = input.recipeTitle;
      data = {
        type: 'match',
        pod_id: input.podId,
        recipe_id: input.recipeId,
        match_id: input.matchId,
        deep_link: `cookdaddy://cookbook/${input.matchId}`,
      };
      break;
    case 'session_invited':
      title = `${input.starterName} wants to swipe! 🥘`;
      body = 'Tap to join.';
      data = {
        type: 'session_invited',
        pod_id: input.podId,
        session_id: input.sessionId,
        deep_link: `cookdaddy://session/${input.sessionId}`,
      };
      break;
    case 'pod_joined':
      title = `${input.joinerName} joined your pod!`;
      body = '';
      data = {
        type: 'pod_joined',
        pod_id: input.podId,
        deep_link: 'cookdaddy://home',
      };
      break;
  }

  return deliverable.flatMap((r) =>
    r.tokens.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default' as const,
      priority: 'high' as const,
      ttl: TTL_SECONDS,
    })),
  );
}
