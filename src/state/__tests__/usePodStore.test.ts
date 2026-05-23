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
