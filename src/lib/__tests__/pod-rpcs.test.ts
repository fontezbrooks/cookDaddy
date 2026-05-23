// Unit tests for the typed P5 RPC wrappers in src/lib/pod-rpcs.ts.
//
// All Postgres exceptions raised by 017_pod_lifecycle_rpcs.sql surface here as
// supabase-js PostgrestError objects whose `message` is the raise text. The
// wrapper must translate those into PodRpcError(code) discriminated unions
// callers can switch on without parsing strings.

import {
  consumePodInvite,
  createPodInvite,
  dissolvePod,
  fetchPartnerForPod,
  PodRpcError,
} from '@/lib/pod-rpcs';

type RpcMock = jest.Mock;

function makeSupabase(rpc: RpcMock) {
  return { rpc } as unknown as Parameters<typeof createPodInvite>[0];
}

function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  // pod_members.select(...).eq(...).neq(...).maybeSingle()
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const neq = jest.fn().mockReturnValue({ maybeSingle });
  const eq = jest.fn().mockReturnValue({ neq });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as Parameters<typeof fetchPartnerForPod>[0],
    from,
    select,
    eq,
    neq,
    maybeSingle,
  };
}

describe('createPodInvite', () => {
  it('returns the parsed { token, expiresAt, podId } on success', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ token: 'abc123', expires_at: '2099-01-01T00:00:00Z', pod_id: 'pod-xyz' }],
      error: null,
    });
    const result = await createPodInvite(makeSupabase(rpc));
    expect(rpc).toHaveBeenCalledWith('create_pod_invite');
    expect(result).toEqual({
      token: 'abc123',
      expiresAt: '2099-01-01T00:00:00Z',
      podId: 'pod-xyz',
    });
  });

  it('throws PodRpcError(already_in_a_pod) when the inviter is already paired', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'already_in_a_pod', code: 'P0001' },
    });
    await expect(createPodInvite(makeSupabase(rpc))).rejects.toMatchObject({
      name: 'PodRpcError',
      code: 'already_in_a_pod',
    });
  });

  it('throws PodRpcError(unknown) when the function returns no row', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    await expect(createPodInvite(makeSupabase(rpc))).rejects.toBeInstanceOf(PodRpcError);
  });
});

describe('consumePodInvite', () => {
  it('passes the raw token under the SQL parameter name p_token', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ pod_id: 'pod-abc', already_member: false }],
      error: null,
    });
    await consumePodInvite(makeSupabase(rpc), 'raw-token-xyz');
    expect(rpc).toHaveBeenCalledWith('consume_pod_invite', { p_token: 'raw-token-xyz' });
  });

  it('returns { podId, alreadyMember } on first consume', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ pod_id: 'pod-abc', already_member: false }],
      error: null,
    });
    await expect(consumePodInvite(makeSupabase(rpc), 'token')).resolves.toEqual({
      podId: 'pod-abc',
      alreadyMember: false,
    });
  });

  it('surfaces already_member=true on idempotent re-tap', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ pod_id: 'pod-abc', already_member: true }],
      error: null,
    });
    await expect(consumePodInvite(makeSupabase(rpc), 'token')).resolves.toMatchObject({
      alreadyMember: true,
    });
  });

  it.each<
    [
      | 'invite_not_found'
      | 'invite_expired'
      | 'invite_already_consumed'
      | 'cannot_consume_own_invite'
      | 'consumer_already_in_a_pod',
    ]
  >([
    ['invite_not_found'],
    ['invite_expired'],
    ['invite_already_consumed'],
    ['cannot_consume_own_invite'],
    ['consumer_already_in_a_pod'],
  ])('maps Postgres %s exception to PodRpcError with the same code', async (msg) => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: msg, code: 'P0001' },
    });
    await expect(consumePodInvite(makeSupabase(rpc), 'tok')).rejects.toMatchObject({
      name: 'PodRpcError',
      code: msg,
    });
  });

  it('maps any other message to code=unknown so callers always get a discriminant', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'connection refused', code: '08000' },
    });
    await expect(consumePodInvite(makeSupabase(rpc), 'tok')).rejects.toMatchObject({
      code: 'unknown',
      message: 'connection refused',
    });
  });
});

describe('dissolvePod', () => {
  it('passes p_pod_id and resolves on success', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    await expect(dissolvePod(makeSupabase(rpc), 'pod-aaa')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('dissolve_pod', { p_pod_id: 'pod-aaa' });
  });

  it('throws PodRpcError(not_member) when the caller is not in the pod', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'not_member', code: 'P0001' },
    });
    await expect(dissolvePod(makeSupabase(rpc), 'pod-aaa')).rejects.toMatchObject({
      code: 'not_member',
    });
  });
});

describe('fetchPartnerForPod', () => {
  it('returns the partner row when the embed query returns a single object', async () => {
    const { client, eq, neq } = makeQueryBuilder({
      data: { user_id: 'user_bob', users: { display_name: 'Bob' } },
      error: null,
    });
    const result = await fetchPartnerForPod(client, 'pod-1', 'user_alice');
    expect(eq).toHaveBeenCalledWith('pod_id', 'pod-1');
    expect(neq).toHaveBeenCalledWith('user_id', 'user_alice');
    expect(result).toEqual({ partnerId: 'user_bob', partnerDisplayName: 'Bob' });
  });

  it('handles the embed returning an array shape (postgrest occasionally does this)', async () => {
    const { client } = makeQueryBuilder({
      data: { user_id: 'user_bob', users: [{ display_name: 'Bob' }] },
      error: null,
    });
    await expect(fetchPartnerForPod(client, 'pod-1', 'user_alice')).resolves.toEqual({
      partnerId: 'user_bob',
      partnerDisplayName: 'Bob',
    });
  });

  it('returns null when the pod has no other member yet', async () => {
    const { client } = makeQueryBuilder({ data: null, error: null });
    await expect(fetchPartnerForPod(client, 'pod-1', 'user_alice')).resolves.toBeNull();
  });

  it('throws PodRpcError(unknown) on a postgrest error', async () => {
    const { client } = makeQueryBuilder({ data: null, error: { message: 'rls denied' } });
    await expect(fetchPartnerForPod(client, 'pod-1', 'user_alice')).rejects.toMatchObject({
      code: 'unknown',
      message: 'rls denied',
    });
  });
});
