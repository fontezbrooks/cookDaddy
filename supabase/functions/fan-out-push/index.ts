// Deno entry point for the push fan-out Edge Function.
//
// Invoked by Supabase Database Webhooks (HTTP POST) on:
//   • matches AFTER INSERT          → match.detected (both pod members)
//   • pod_invites AFTER UPDATE      → pod_invite.consumed (inviter only)
//   • sessions AFTER INSERT (lobby) → session.invited (the non-starter member)
// (Locked decision D-9: webhook-driven, not pg_notify.)
//
// Verifies a shared secret header, classifies the payload, resolves recipients
// + tokens + per-type opt-outs from Postgres with the service-role client, then
// builds Expo push messages (../_shared/fan-out-push.ts) and POSTs them to the
// Expo push service. It also emits server-side PostHog events
// (pod_invite_consumed / session_started), gated on POSTHOG_API_KEY. All non-IO
// logic is unit-tested under Jest in _shared.
//
// Source spec: docs/DESIGN/README.md §9 + docs/WORKFLOW/README.md §14.
// Local: `supabase functions serve fan-out-push`.
//
// @ts-nocheck

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PostHog } from 'npm:posthog-node@4';
import {
  buildExpoMessages,
  classifyWebhook,
  WebhookPayloadError,
  type Recipient,
} from '../_shared/fan-out-push.ts';
import { buildAnalyticsEvents } from '../_shared/server-analytics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FANOUT_WEBHOOK_SECRET = Deno.env.get('FANOUT_WEBHOOK_SECRET');
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN'); // optional
const POSTHOG_API_KEY = Deno.env.get('POSTHOG_API_KEY');
const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FANOUT_WEBHOOK_SECRET) {
  console.error('fan-out-push: missing required env vars');
}

const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
});

// prefField maps a push event kind → the notification_prefs column gating it.
const prefField = {
  match: 'match_enabled',
  session_invited: 'session_invite_enabled',
  pod_joined: 'pod_joined_enabled',
} as const;

async function podMemberIds(podId: string): Promise<string[]> {
  const { data } = await supabase.from('pod_members').select('user_id').eq('pod_id', podId);
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

async function tokensFor(userId: string): Promise<string[]> {
  const { data } = await supabase.from('push_tokens').select('expo_token').eq('user_id', userId);
  return (data ?? []).map((r: { expo_token: string }) => r.expo_token);
}

async function prefEnabled(userId: string, column: string): Promise<boolean> {
  const { data } = await supabase
    .from('notification_prefs')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return true; // no row → defaults on
  const v = (data as Record<string, unknown>)[column];
  return v !== false;
}

async function resolveRecipients(userIds: string[], column: string): Promise<Recipient[]> {
  return Promise.all(
    userIds.map(async (userId) => ({
      userId,
      tokens: await tokensFor(userId),
      prefEnabled: await prefEnabled(userId, column),
    })),
  );
}

async function displayName(userId: string): Promise<string> {
  const { data } = await supabase.from('users').select('display_name').eq('id', userId).maybeSingle();
  return (data?.display_name as string) ?? 'Your partner';
}

async function recipeTitle(recipeId: string): Promise<string> {
  const { data } = await supabase.from('recipes').select('title').eq('id', recipeId).maybeSingle();
  return (data?.title as string) ?? 'A new recipe';
}

async function sendExpo(messages: unknown[]): Promise<void> {
  if (messages.length === 0) return;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error('expo push send failed', res.status, await res.text());
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  if (!FANOUT_WEBHOOK_SECRET) {
    return new Response('webhook secret not configured', { status: 500 });
  }
  const provided =
    req.headers.get('x-fanout-secret') ??
    (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (provided !== FANOUT_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  let event;
  let body;
  try {
    body = await req.json();
    event = classifyWebhook(body);
  } catch (err) {
    if (err instanceof WebhookPayloadError) {
      return new Response(`bad payload: ${err.message}`, { status: 400 });
    }
    throw err;
  }

  let messages: unknown[] = [];
  switch (event.kind) {
    case 'match': {
      const members = await podMemberIds(event.podId);
      const recipients = await resolveRecipients(members, prefField.match);
      messages = buildExpoMessages({
        kind: 'match',
        podId: event.podId,
        recipeId: event.recipeId,
        matchId: event.matchId,
        recipeTitle: await recipeTitle(event.recipeId),
        recipients,
      });
      break;
    }
    case 'pod_joined': {
      const recipients = await resolveRecipients([event.inviterUserId], prefField.pod_joined);
      messages = buildExpoMessages({
        kind: 'pod_joined',
        podId: event.podId,
        joinerName: await displayName(event.consumerUserId),
        recipients,
      });
      break;
    }
    case 'session_invited': {
      const members = await podMemberIds(event.podId);
      const others = members.filter((id) => id !== event.startedBy);
      const recipients = await resolveRecipients(others, prefField.session_invited);
      messages = buildExpoMessages({
        kind: 'session_invited',
        podId: event.podId,
        sessionId: event.sessionId,
        starterName: await displayName(event.startedBy),
        recipients,
      });
      break;
    }
    case 'ignored':
      return new Response('ignored', { status: 200 });
  }

  await sendExpo(messages);
  if (POSTHOG_API_KEY) {
    try {
      const captures = buildAnalyticsEvents(event, body.record ?? {});
      if (captures.length) {
        const ph = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });
        for (const c of captures) {
          ph.capture({
            distinctId: c.distinctId,
            event: c.event,
            properties: c.properties,
            groups: c.groups,
          });
        }
        await ph.shutdown();
      }
    } catch (err) {
      console.error('fan-out-push: posthog capture failed', err);
    }
  }
  return new Response(JSON.stringify({ sent: messages.length }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
