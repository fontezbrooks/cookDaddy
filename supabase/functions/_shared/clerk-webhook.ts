// Pure logic for the Clerk → Supabase user-sync webhook.
//
// The Deno entry in supabase/functions/clerk-user-webhook/index.ts is a thin wrapper:
// it pulls env vars, builds a service-role Supabase client, then defers to the helpers
// here. Everything in this file is environment-agnostic so Jest can exercise it directly.
//
// Source spec: docs/DESIGN/README.md §4 + docs/WORKFLOW/README.md §5.

import { Webhook, type WebhookRequiredHeaders } from 'svix';

export type ClerkUserUpserted = {
  kind: 'user.upserted';
  user: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
};

export type ClerkUserDeleted = {
  kind: 'user.deleted';
  user_id: string;
};

export type ClerkWebhookAction = ClerkUserUpserted | ClerkUserDeleted | { kind: 'ignored' };

export class WebhookSignatureError extends Error {
  override readonly name = 'WebhookSignatureError';
}

export class WebhookPayloadError extends Error {
  override readonly name = 'WebhookPayloadError';
}

// Verify the Svix signature over the raw request body. Throws WebhookSignatureError
// on failure. Returns the parsed payload on success.
export function verifyClerkSignature(
  rawBody: string,
  headers: Partial<WebhookRequiredHeaders>,
  secret: string,
): unknown {
  const required = {
    'svix-id': headers['svix-id'],
    'svix-timestamp': headers['svix-timestamp'],
    'svix-signature': headers['svix-signature'],
  };
  if (!required['svix-id'] || !required['svix-timestamp'] || !required['svix-signature']) {
    throw new WebhookSignatureError('missing svix headers');
  }
  try {
    return new Webhook(secret).verify(rawBody, required as WebhookRequiredHeaders);
  } catch (err) {
    throw new WebhookSignatureError(
      err instanceof Error ? err.message : 'svix verification failed',
    );
  }
}

// Convert a verified Clerk webhook payload into a DB action plan.
// Anything we don't act on (e.g. `session.created`) collapses to `ignored`.
export function planAction(payload: unknown): ClerkWebhookAction {
  if (!isClerkEvent(payload)) {
    throw new WebhookPayloadError('payload missing type/data fields');
  }
  switch (payload.type) {
    case 'user.created':
    case 'user.updated':
      return {
        kind: 'user.upserted',
        user: extractUser(payload.data),
      };
    case 'user.deleted':
      return {
        kind: 'user.deleted',
        user_id: extractUserId(payload.data),
      };
    default:
      return { kind: 'ignored' };
  }
}

type ClerkEvent = { type: string; data: Record<string, unknown> };

function isClerkEvent(p: unknown): p is ClerkEvent {
  if (typeof p !== 'object' || p === null) return false;
  const ev = p as Record<string, unknown>;
  return typeof ev.type === 'string' && typeof ev.data === 'object' && ev.data !== null;
}

function extractUser(data: Record<string, unknown>): ClerkUserUpserted['user'] {
  const id = extractUserId(data);
  const displayName = pickDisplayName(data);
  const avatarUrl =
    pickStringOrNull(data, 'image_url') ?? pickStringOrNull(data, 'profile_image_url');
  return { id, display_name: displayName, avatar_url: avatarUrl };
}

function extractUserId(data: Record<string, unknown>): string {
  if (typeof data.id !== 'string' || data.id.length === 0) {
    throw new WebhookPayloadError('clerk webhook data.id missing');
  }
  return data.id;
}

function pickDisplayName(data: Record<string, unknown>): string {
  const first = pickStringOrNull(data, 'first_name');
  const last = pickStringOrNull(data, 'last_name');
  const composed = [first, last].filter(Boolean).join(' ').trim();
  if (composed.length > 0) return composed;
  const username = pickStringOrNull(data, 'username');
  if (username) return username;
  const email = pickPrimaryEmail(data);
  if (email) return email;
  // Fallback so users.display_name (NOT NULL) is always satisfied.
  return extractUserId(data);
}

function pickStringOrNull(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function pickPrimaryEmail(data: Record<string, unknown>): string | null {
  const primaryId = pickStringOrNull(data, 'primary_email_address_id');
  const addresses = data.email_addresses;
  if (!Array.isArray(addresses)) return null;
  const matchedById = primaryId
    ? addresses.find(
        (a): a is { id: string; email_address: string } =>
          typeof a === 'object' &&
          a !== null &&
          (a as Record<string, unknown>).id === primaryId &&
          typeof (a as Record<string, unknown>).email_address === 'string',
      )
    : undefined;
  if (matchedById) return matchedById.email_address;
  const first = addresses[0];
  if (
    typeof first === 'object' &&
    first !== null &&
    typeof (first as Record<string, unknown>).email_address === 'string'
  ) {
    return (first as Record<string, unknown>).email_address as string;
  }
  return null;
}
