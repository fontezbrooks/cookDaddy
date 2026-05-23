// Unit tests for the typed P6 session RPC wrappers. Mirror of pod-rpcs.test.ts.
// All Postgres exceptions raised by 018_swipe_session_rpcs.sql surface here
// as supabase-js PostgrestError objects whose `message` is the raise text;
// the wrappers translate those into SessionRpcError(code) so callers can
// switch on a discriminant without parsing strings.

import {
  endSession,
  markSessionActive,
  SessionRpcError,
  startSession,
  submitSwipe,
} from '@/lib/session-rpcs';

type RpcMock = jest.Mock;

function makeSupabase(rpc: RpcMock) {
  return { rpc } as unknown as Parameters<typeof startSession>[0];
}

describe('startSession', () => {
  it('returns parsed { sessionId, deckRecipeIds } on success', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ session_id: 'sess-1', deck_recipe_ids: ['r1', 'r2', 'r3'] }],
      error: null,
    });
    const result = await startSession(makeSupabase(rpc), 'pod-1');
    expect(rpc).toHaveBeenCalledWith('start_session', { p_pod_id: 'pod-1' });
    expect(result).toEqual({ sessionId: 'sess-1', deckRecipeIds: ['r1', 'r2', 'r3'] });
  });

  it('throws SessionRpcError(not_member) when caller is not in the pod', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'not_member', code: 'P0001' },
    });
    await expect(startSession(makeSupabase(rpc), 'pod-1')).rejects.toMatchObject({
      name: 'SessionRpcError',
      code: 'not_member',
    });
  });

  it('throws SessionRpcError(unknown) on empty result', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    await expect(startSession(makeSupabase(rpc), 'pod-1')).rejects.toBeInstanceOf(SessionRpcError);
  });
});

describe('markSessionActive', () => {
  it('passes p_session_id and resolves on success', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    await expect(markSessionActive(makeSupabase(rpc), 'sess-1')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('mark_session_active', { p_session_id: 'sess-1' });
  });

  it('maps session_not_pending to SessionRpcError', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'session_not_pending', code: 'P0001' },
    });
    await expect(markSessionActive(makeSupabase(rpc), 'sess-1')).rejects.toMatchObject({
      code: 'session_not_pending',
    });
  });
});

describe('submitSwipe', () => {
  it('passes the (session_id, recipe_id, direction) tuple', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ match: false, match_id: null, already_matched: false }],
      error: null,
    });
    await submitSwipe(makeSupabase(rpc), 'sess-1', 'r-1', 'right');
    expect(rpc).toHaveBeenCalledWith('submit_swipe', {
      p_session_id: 'sess-1',
      p_recipe_id: 'r-1',
      p_direction: 'right',
    });
  });

  it('surfaces a match on the second right-swipe', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ match: true, match_id: 'm-1', already_matched: false }],
      error: null,
    });
    await expect(submitSwipe(makeSupabase(rpc), 'sess-1', 'r-1', 'right')).resolves.toEqual({
      match: true,
      matchId: 'm-1',
      alreadyMatched: false,
    });
  });

  it('surfaces alreadyMatched=true when the recipe was matched in a prior session', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ match: false, match_id: null, already_matched: true }],
      error: null,
    });
    await expect(submitSwipe(makeSupabase(rpc), 'sess-1', 'r-1', 'right')).resolves.toMatchObject({
      alreadyMatched: true,
    });
  });

  it.each([['session_not_active'], ['forbidden'], ['unauthenticated']] as const)(
    'maps Postgres %s exception to SessionRpcError with the same code',
    async (msg) => {
      const rpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: msg, code: 'P0001' },
      });
      await expect(submitSwipe(makeSupabase(rpc), 's', 'r', 'right')).rejects.toMatchObject({
        code: msg,
      });
    },
  );
});

describe('endSession', () => {
  it('passes p_session_id + p_reason and resolves on success', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    await expect(endSession(makeSupabase(rpc), 'sess-1', 'user_ended')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('end_session', {
      p_session_id: 'sess-1',
      p_reason: 'user_ended',
    });
  });

  it('maps not_member to SessionRpcError', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'not_member', code: 'P0001' },
    });
    await expect(endSession(makeSupabase(rpc), 's', 'user_ended')).rejects.toMatchObject({
      code: 'not_member',
    });
  });
});
