// Jest unit tests for the Clerk webhook pure logic.
// The Deno entry (../clerk-user-webhook/index.ts) is NOT imported here — its
// `npm:` imports and `Deno.env` access would break Jest. We only exercise the
// environment-agnostic helpers in ../clerk-webhook.ts.

import { Webhook } from 'svix';

import {
  WebhookPayloadError,
  WebhookSignatureError,
  planAction,
  verifyClerkSignature,
} from '../clerk-webhook';

const WEBHOOK_SECRET = 'whsec_dGVzdC1zZWNyZXQtZm9yLWp1bml0LXRlc3Rz';

function signWith(secret: string, payload: object) {
  const body = JSON.stringify(payload);
  const id = `msg_${Date.now()}`;
  const wh = new Webhook(secret);
  const signature = wh.sign(id, new Date(), body);
  return {
    body,
    headers: {
      'svix-id': id,
      'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
      'svix-signature': signature,
    },
  };
}

describe('verifyClerkSignature', () => {
  it('returns the parsed payload when the signature is valid', () => {
    const payload = { type: 'user.created', data: { id: 'user_x' } };
    const { body, headers } = signWith(WEBHOOK_SECRET, payload);

    const verified = verifyClerkSignature(body, headers, WEBHOOK_SECRET);
    expect(verified).toEqual(payload);
  });

  it('throws WebhookSignatureError when the signature does not match the secret', () => {
    const payload = { type: 'user.created', data: { id: 'user_x' } };
    const { body, headers } = signWith(WEBHOOK_SECRET, payload);

    expect(() => verifyClerkSignature(body, headers, 'whsec_d3JvbmctYW55LXNlY3JldA')).toThrow(
      WebhookSignatureError,
    );
  });

  it('throws WebhookSignatureError when required svix headers are missing', () => {
    expect(() => verifyClerkSignature('{}', { 'svix-id': 'msg_1' }, WEBHOOK_SECRET)).toThrow(
      WebhookSignatureError,
    );
  });
});

describe('planAction', () => {
  it('maps user.created → upsert with the first/last name composed', () => {
    expect(
      planAction({
        type: 'user.created',
        data: {
          id: 'user_alice',
          first_name: 'Alice',
          last_name: 'Wong',
          image_url: 'https://img/alice.png',
        },
      }),
    ).toEqual({
      kind: 'user.upserted',
      user: { id: 'user_alice', display_name: 'Alice Wong', avatar_url: 'https://img/alice.png' },
    });
  });

  it('maps user.updated identically to user.created', () => {
    expect(
      planAction({
        type: 'user.updated',
        data: { id: 'user_bob', first_name: 'Bob' },
      }),
    ).toEqual({
      kind: 'user.upserted',
      user: { id: 'user_bob', display_name: 'Bob', avatar_url: null },
    });
  });

  it('falls back to username, then primary email, then user id for display_name', () => {
    expect(
      planAction({
        type: 'user.created',
        data: { id: 'user_c', username: 'carol_c' },
      }),
    ).toMatchObject({ user: { display_name: 'carol_c' } });

    expect(
      planAction({
        type: 'user.created',
        data: {
          id: 'user_d',
          primary_email_address_id: 'eid_1',
          email_addresses: [
            { id: 'eid_0', email_address: 'other@example.com' },
            { id: 'eid_1', email_address: 'dee@example.com' },
          ],
        },
      }),
    ).toMatchObject({ user: { display_name: 'dee@example.com' } });

    expect(
      planAction({
        type: 'user.created',
        data: { id: 'user_e' },
      }),
    ).toMatchObject({ user: { display_name: 'user_e' } });
  });

  it('prefers image_url over profile_image_url for avatar', () => {
    expect(
      planAction({
        type: 'user.created',
        data: {
          id: 'user_f',
          first_name: 'F',
          image_url: 'https://img/new.png',
          profile_image_url: 'https://img/legacy.png',
        },
      }),
    ).toMatchObject({ user: { avatar_url: 'https://img/new.png' } });
  });

  it('maps user.deleted → user.deleted action', () => {
    expect(
      planAction({
        type: 'user.deleted',
        data: { id: 'user_gone' },
      }),
    ).toEqual({ kind: 'user.deleted', user_id: 'user_gone' });
  });

  it('returns ignored for unrelated event types', () => {
    expect(planAction({ type: 'session.created', data: { id: 's_1' } })).toEqual({
      kind: 'ignored',
    });
  });

  it('throws WebhookPayloadError when payload is malformed', () => {
    expect(() => planAction(null)).toThrow(WebhookPayloadError);
    expect(() => planAction({})).toThrow(WebhookPayloadError);
    expect(() => planAction({ type: 'user.created', data: {} })).toThrow(WebhookPayloadError);
  });
});
