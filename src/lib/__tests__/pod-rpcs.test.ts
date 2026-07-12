// Unit tests for the typed P5 RPC wrappers in src/lib/pod-rpcs.ts.
//
// All Postgres exceptions raised by 017_pod_lifecycle_rpcs.sql surface here as
// supabase-js PostgrestError objects whose `message` is the raise text. The
// wrapper must translate those into PodRpcError(code) discriminated unions
// callers can switch on without parsing strings.

import {
  consumePodInvite,
  createPodInvite,
  getMyPod,
  leaveMyPod,
  PodRpcError,
} from '@/lib/pod-rpcs';

type RpcMock = jest.Mock;

function makeSupabase(rpc: RpcMock) {
  return { rpc } as unknown as Parameters<typeof createPodInvite>[0];
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

describe('getMyPod', () => {
  it('parses a paired membership row (array shape)', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          pod_id: 'pod-1',
          partner_user_id: 'user_bob',
          partner_display_name: 'Bob',
          member_count: 2,
        },
      ],
      error: null,
    });
    await expect(getMyPod(makeSupabase(rpc))).resolves.toEqual({
      podId: 'pod-1',
      partnerId: 'user_bob',
      partnerDisplayName: 'Bob',
      memberCount: 2,
    });
    expect(rpc).toHaveBeenCalledWith('get_my_pod');
  });

  it('parses a solo membership row with null partner columns', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        { pod_id: 'pod-1', partner_user_id: null, partner_display_name: null, member_count: 1 },
      ],
      error: null,
    });
    await expect(getMyPod(makeSupabase(rpc))).resolves.toEqual({
      podId: 'pod-1',
      partnerId: null,
      partnerDisplayName: null,
      memberCount: 1,
    });
  });

  it('returns null when the caller has no active pod (empty rowset)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    await expect(getMyPod(makeSupabase(rpc))).resolves.toBeNull();
  });

  it('throws PodRpcError(unauthenticated) when the RPC raises', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'unauthenticated', code: 'P0001' },
    });
    await expect(getMyPod(makeSupabase(rpc))).rejects.toMatchObject({
      name: 'PodRpcError',
      code: 'unauthenticated',
    });
  });

  it('maps transport failures to code=unknown so callers get a discriminant', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'connection refused', code: '08000' },
    });
    await expect(getMyPod(makeSupabase(rpc))).rejects.toMatchObject({
      code: 'unknown',
      message: 'connection refused',
    });
  });
});

describe('leaveMyPod', () => {
  it('resolves true when a pod was dissolved', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    await expect(leaveMyPod(makeSupabase(rpc))).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('leave_my_pod');
  });

  it('resolves false when the caller had no active pod (idempotent no-op)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
    await expect(leaveMyPod(makeSupabase(rpc))).resolves.toBe(false);
  });

  it('throws PodRpcError with the raised code', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'unauthenticated', code: 'P0001' },
    });
    await expect(leaveMyPod(makeSupabase(rpc))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
