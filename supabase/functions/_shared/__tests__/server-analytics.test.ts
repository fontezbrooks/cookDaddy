import { buildAnalyticsEvents } from '../server-analytics';

describe('buildAnalyticsEvents', () => {
  it('builds a pod_invite_consumed capture with time_to_consume_min when timestamps are valid', () => {
    const captures = buildAnalyticsEvents(
      {
        kind: 'pod_joined',
        podId: 'pod_1',
        inviterUserId: 'user_alice',
        consumerUserId: 'user_bob',
      },
      {
        created_at: '2026-05-24T12:00:00Z',
        consumed_at: '2026-05-24T12:20:00Z',
        display_name: 'Bob',
        email: 'bob@example.com',
      },
    );

    expect(captures).toEqual([
      {
        distinctId: 'user_bob',
        event: 'pod_invite_consumed',
        properties: {
          pod_id: 'pod_1',
          inviter_user_id: 'user_alice',
          consumer_user_id: 'user_bob',
          time_to_consume_min: 20,
        },
        groups: { pod: 'pod_1' },
      },
    ]);
    const capture = captures[0]!;
    expect(capture.properties).not.toHaveProperty('display_name');
    expect(capture.properties).not.toHaveProperty('email');
    expect(capture.properties).not.toHaveProperty('name');
  });

  it('omits time_to_consume_min when timestamps are missing', () => {
    const captures = buildAnalyticsEvents(
      {
        kind: 'pod_joined',
        podId: 'pod_1',
        inviterUserId: 'user_alice',
        consumerUserId: 'user_bob',
      },
      {},
    );

    const capture = captures[0]!;
    expect(capture).toBeDefined();
    expect(capture.event).toBe('pod_invite_consumed');
    expect('time_to_consume_min' in capture.properties).toBe(false);
  });

  it('builds a session_started capture with deck_size from deck_recipe_ids', () => {
    expect(
      buildAnalyticsEvents(
        {
          kind: 'session_invited',
          podId: 'pod_1',
          sessionId: 'session_1',
          startedBy: 'user_alice',
        },
        { deck_recipe_ids: ['recipe_1', 'recipe_2', 'recipe_3'] },
      ),
    ).toEqual([
      {
        distinctId: 'user_alice',
        event: 'session_started',
        properties: {
          session_id: 'session_1',
          pod_id: 'pod_1',
          deck_size: 3,
        },
        groups: { pod: 'pod_1' },
      },
    ]);
  });

  it('returns no captures for match and ignored events', () => {
    expect(
      buildAnalyticsEvents(
        {
          kind: 'match',
          podId: 'pod_1',
          recipeId: 'recipe_1',
          matchId: 'match_1',
          sessionId: 'session_1',
        },
        {},
      ),
    ).toHaveLength(0);
    expect(buildAnalyticsEvents({ kind: 'ignored' }, {})).toHaveLength(0);
  });
});
