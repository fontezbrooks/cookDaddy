/**
 * Pod store contract tests. usePodStore is memory-only per DESIGN §10.2 —
 * the active pod is a session-scoped concept that should refetch from the
 * server on each cold start (a partner could have dissolved the pod while
 * the app was backgrounded — FR-P6).
 */

import { __resetPodStoreForTests, usePodStore } from '../usePodStore';

describe('usePodStore', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
  });

  it('initializes with no active pod', () => {
    const { activePodId, partnerId, partnerDisplayName } = usePodStore.getState();
    expect(activePodId).toBeNull();
    expect(partnerId).toBeNull();
    expect(partnerDisplayName).toBeNull();
  });

  it('setActivePod sets all three fields', () => {
    usePodStore.getState().setActivePod({
      podId: 'pod_123',
      partnerId: 'partner_abc',
      partnerDisplayName: 'Partner',
    });

    const state = usePodStore.getState();
    expect(state.activePodId).toBe('pod_123');
    expect(state.partnerId).toBe('partner_abc');
    expect(state.partnerDisplayName).toBe('Partner');
  });

  it('clearActivePod wipes all fields', () => {
    usePodStore.getState().setActivePod({
      podId: 'pod_123',
      partnerId: 'partner_abc',
      partnerDisplayName: 'Partner',
    });
    usePodStore.getState().clearActivePod();

    const state = usePodStore.getState();
    expect(state.activePodId).toBeNull();
    expect(state.partnerId).toBeNull();
    expect(state.partnerDisplayName).toBeNull();
  });
});

// syncStatus state-machine contract (docs/POD-READ-PATH/README.md FR-2):
// 'unknown' until the first server read, 'error' on a failed read (pod fields
// preserved), 'ready' once the server confirmed membership either way.
describe('usePodStore syncStatus transitions', () => {
  const PAIRED = { podId: 'pod-1', partnerId: 'user_alice', partnerDisplayName: 'Alice' };

  beforeEach(() => {
    __resetPodStoreForTests();
  });

  it('starts unknown', () => {
    expect(usePodStore.getState().syncStatus).toBe('unknown');
  });

  it('setActivePod → ready', () => {
    usePodStore.getState().setActivePod(PAIRED);
    expect(usePodStore.getState().syncStatus).toBe('ready');
  });

  it('noteSyncError → error while PRESERVING the known pod', () => {
    usePodStore.getState().setActivePod(PAIRED);
    usePodStore.getState().noteSyncError();
    expect(usePodStore.getState()).toMatchObject({
      activePodId: 'pod-1',
      partnerId: 'user_alice',
      syncStatus: 'error',
    });
  });

  it('noteSyncedEmpty → ready, podless, no partnerRemoved flag', () => {
    usePodStore.getState().noteSyncedEmpty();
    expect(usePodStore.getState()).toMatchObject({
      activePodId: null,
      partnerRemoved: false,
      syncStatus: 'ready',
    });
  });

  it('clearActivePod (user-initiated leave) → ready and podless', () => {
    usePodStore.getState().setActivePod(PAIRED);
    usePodStore.getState().clearActivePod();
    expect(usePodStore.getState()).toMatchObject({ activePodId: null, syncStatus: 'ready' });
  });

  it('notePartnerRemoved → ready + flag; acknowledge clears only the flag', () => {
    usePodStore.getState().setActivePod(PAIRED);
    usePodStore.getState().notePartnerRemoved();
    expect(usePodStore.getState()).toMatchObject({
      activePodId: null,
      partnerRemoved: true,
      syncStatus: 'ready',
    });

    usePodStore.getState().acknowledgePartnerRemoved();
    expect(usePodStore.getState()).toMatchObject({ partnerRemoved: false, syncStatus: 'ready' });
  });
});
