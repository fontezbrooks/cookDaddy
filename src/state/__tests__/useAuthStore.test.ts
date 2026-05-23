/**
 * Auth store contract tests. The store mirrors the slice of Clerk identity
 * we keep client-side for fast cold-start (no flash of "Welcome" before the
 * users-row network fetch). Persistence to MMKV must round-trip.
 */

import { __resetAuthStoreForTests, useAuthStore } from '../useAuthStore';

const { __getMmkvMockStore } = require('react-native-mmkv') as {
  __getMmkvMockStore: (id: string) => Map<string, string>;
};

function getMockStore(): Map<string, string> {
  return __getMmkvMockStore('cookdaddy-auth');
}

describe('useAuthStore', () => {
  beforeEach(() => {
    getMockStore().clear();
    __resetAuthStoreForTests();
  });

  it('initializes empty', () => {
    const { userId, displayName, avatarUrl } = useAuthStore.getState();
    expect(userId).toBeNull();
    expect(displayName).toBeNull();
    expect(avatarUrl).toBeNull();
  });

  it('setUser persists to MMKV with all three fields', () => {
    useAuthStore.getState().setUser({
      id: 'user_clerk_abc',
      displayName: 'Fontez',
      avatarUrl: 'https://img.example/x.png',
    });

    const state = useAuthStore.getState();
    expect(state.userId).toBe('user_clerk_abc');
    expect(state.displayName).toBe('Fontez');
    expect(state.avatarUrl).toBe('https://img.example/x.png');

    // Persistence — Zustand stores the slice under a known key in MMKV.
    const raw = getMockStore().get('auth-store');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.userId).toBe('user_clerk_abc');
    expect(parsed.state.displayName).toBe('Fontez');
  });

  it('setUser handles missing avatarUrl', () => {
    useAuthStore.getState().setUser({
      id: 'user_clerk_xyz',
      displayName: 'No Avatar',
    });
    expect(useAuthStore.getState().avatarUrl).toBeNull();
  });

  it('clearUser zeroes out and persists the cleared state', () => {
    useAuthStore.getState().setUser({ id: 'u1', displayName: 'X' });
    useAuthStore.getState().clearUser();

    expect(useAuthStore.getState().userId).toBeNull();
    expect(useAuthStore.getState().displayName).toBeNull();

    const raw = getMockStore().get('auth-store');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.userId).toBeNull();
  });

  it('hydrates from existing MMKV state', () => {
    // Seed the mock storage BEFORE the store module is re-evaluated, so the
    // persist middleware reads the seeded blob during its init pass.
    getMockStore().set(
      'auth-store',
      JSON.stringify({
        state: {
          userId: 'pre_existing',
          displayName: 'Returning User',
          avatarUrl: null,
        },
        version: 0,
      }),
    );

    let freshStore: typeof useAuthStore | undefined;
    jest.isolateModules(() => {
      freshStore = require('../useAuthStore').useAuthStore;
    });

    const state = freshStore!.getState();
    expect(state.userId).toBe('pre_existing');
    expect(state.displayName).toBe('Returning User');
  });
});
