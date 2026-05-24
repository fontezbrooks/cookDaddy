// Jest unit tests for the push fan-out pure logic.
// The Deno entry (../fan-out-push/index.ts) is NOT imported here — its
// `npm:` imports and `Deno.env` access would break Jest. We only exercise the
// environment-agnostic helpers in ../fan-out-push.ts.

import { WebhookPayloadError, buildExpoMessages, classifyWebhook } from '../fan-out-push';

describe('classifyWebhook', () => {
  it('maps matches INSERT to a match event', () => {
    expect(
      classifyWebhook({
        type: 'INSERT',
        table: 'matches',
        schema: 'public',
        record: {
          id: 'match_1',
          pod_id: 'pod_1',
          recipe_id: 'recipe_1',
          session_id: 'session_1',
        },
        old_record: null,
      }),
    ).toEqual({
      kind: 'match',
      podId: 'pod_1',
      recipeId: 'recipe_1',
      matchId: 'match_1',
      sessionId: 'session_1',
    });
  });

  it('maps first pod_invites consumption UPDATE to a pod_joined event', () => {
    expect(
      classifyWebhook({
        type: 'UPDATE',
        table: 'pod_invites',
        schema: 'public',
        record: {
          pod_id: 'pod_1',
          inviter_user_id: 'user_alice',
          consumed_by: 'user_bob',
          consumed_at: '2026-05-24T12:00:00Z',
        },
        old_record: { consumed_at: null },
      }),
    ).toEqual({
      kind: 'pod_joined',
      podId: 'pod_1',
      inviterUserId: 'user_alice',
      consumerUserId: 'user_bob',
    });
  });

  it('ignores pod_invites UPDATE when it was already consumed', () => {
    expect(
      classifyWebhook({
        type: 'UPDATE',
        table: 'pod_invites',
        schema: 'public',
        record: { consumed_at: '2026-05-24T12:00:00Z' },
        old_record: { consumed_at: '2026-05-24T11:00:00Z' },
      }),
    ).toEqual({ kind: 'ignored' });
  });

  it('maps sessions INSERT in lobby status to a session_invited event', () => {
    expect(
      classifyWebhook({
        type: 'INSERT',
        table: 'sessions',
        schema: 'public',
        record: {
          id: 'session_1',
          pod_id: 'pod_1',
          started_by: 'user_alice',
          status: 'lobby',
        },
        old_record: null,
      }),
    ).toEqual({
      kind: 'session_invited',
      podId: 'pod_1',
      sessionId: 'session_1',
      startedBy: 'user_alice',
    });
  });

  it('ignores sessions INSERT in active status', () => {
    expect(
      classifyWebhook({
        type: 'INSERT',
        table: 'sessions',
        schema: 'public',
        record: { id: 'session_1', status: 'active' },
        old_record: null,
      }),
    ).toEqual({ kind: 'ignored' });
  });

  it('ignores unrelated tables', () => {
    expect(
      classifyWebhook({
        type: 'INSERT',
        table: 'swipes',
        schema: 'public',
        record: { id: 'swipe_1' },
        old_record: null,
      }),
    ).toEqual({ kind: 'ignored' });
  });

  it('throws WebhookPayloadError on malformed payloads', () => {
    expect(() => classifyWebhook(null)).toThrow(WebhookPayloadError);
    expect(() => classifyWebhook({})).toThrow(WebhookPayloadError);
    expect(() =>
      classifyWebhook({
        type: 'INSERT',
        table: 'matches',
        schema: 'public',
        record: { id: 'match_1', recipe_id: 'recipe_1', session_id: 'session_1' },
        old_record: null,
      }),
    ).toThrow(WebhookPayloadError);
  });
});

describe('buildExpoMessages', () => {
  it('builds one match message per deliverable token', () => {
    const messages = buildExpoMessages({
      kind: 'match',
      podId: 'pod_1',
      recipeId: 'recipe_1',
      matchId: 'match_1',
      recipeTitle: 'Tacos',
      recipients: [
        { userId: 'user_alice', tokens: ['ExponentPushToken[alice]'], prefEnabled: true },
        {
          userId: 'user_bob',
          tokens: ['ExponentPushToken[bob_1]', 'ExponentPushToken[bob_2]'],
          prefEnabled: true,
        },
      ],
    });

    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.to)).toEqual([
      'ExponentPushToken[alice]',
      'ExponentPushToken[bob_1]',
      'ExponentPushToken[bob_2]',
    ]);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "It's a match! 🎉",
          body: 'Tacos',
          data: expect.objectContaining({
            type: 'match',
            deep_link: 'cookdaddy://cookbook/match_1',
          }),
          sound: 'default',
          priority: 'high',
          ttl: 3600,
        }),
      ]),
    );
  });

  it('skips a recipient whose preference is disabled', () => {
    expect(
      buildExpoMessages({
        kind: 'match',
        podId: 'pod_1',
        recipeId: 'recipe_1',
        matchId: 'match_1',
        recipeTitle: 'Tacos',
        recipients: [
          { userId: 'user_alice', tokens: ['ExponentPushToken[alice]'], prefEnabled: false },
          { userId: 'user_bob', tokens: ['ExponentPushToken[bob]'], prefEnabled: true },
        ],
      }).map((m) => m.to),
    ).toEqual(['ExponentPushToken[bob]']);
  });

  it('skips a recipient with zero tokens', () => {
    expect(
      buildExpoMessages({
        kind: 'match',
        podId: 'pod_1',
        recipeId: 'recipe_1',
        matchId: 'match_1',
        recipeTitle: 'Tacos',
        recipients: [
          { userId: 'user_alice', tokens: [], prefEnabled: true },
          { userId: 'user_bob', tokens: ['ExponentPushToken[bob]'], prefEnabled: true },
        ],
      }).map((m) => m.to),
    ).toEqual(['ExponentPushToken[bob]']);
  });

  it('builds session_invited copy and deep link', () => {
    expect(
      buildExpoMessages({
        kind: 'session_invited',
        podId: 'pod_1',
        sessionId: 'session_1',
        starterName: 'Alice',
        recipients: [{ userId: 'user_bob', tokens: ['ExponentPushToken[bob]'], prefEnabled: true }],
      }),
    ).toEqual([
      expect.objectContaining({
        title: 'Alice wants to swipe! 🥘',
        body: 'Tap to join.',
        data: expect.objectContaining({
          type: 'session_invited',
          deep_link: 'cookdaddy://session/session_1',
        }),
      }),
    ]);
  });

  it('builds pod_joined copy and deep link', () => {
    expect(
      buildExpoMessages({
        kind: 'pod_joined',
        podId: 'pod_1',
        joinerName: 'Bob',
        recipients: [
          { userId: 'user_alice', tokens: ['ExponentPushToken[alice]'], prefEnabled: true },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        title: 'Bob joined your pod!',
        body: '',
        data: expect.objectContaining({
          type: 'pod_joined',
          deep_link: 'cookdaddy://home',
        }),
      }),
    ]);
  });

  it('returns an empty array when all recipients are filtered out', () => {
    expect(
      buildExpoMessages({
        kind: 'pod_joined',
        podId: 'pod_1',
        joinerName: 'Bob',
        recipients: [
          { userId: 'user_alice', tokens: ['ExponentPushToken[alice]'], prefEnabled: false },
          { userId: 'user_bob', tokens: [], prefEnabled: true },
        ],
      }),
    ).toEqual([]);
  });
});
