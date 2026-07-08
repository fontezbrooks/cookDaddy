/**
 * Auth store contract tests. The store mirrors the slice of Clerk identity
 * we keep client-side for fast cold-start (no flash of "Welcome" before the
 * users-row network fetch). Persistence to secure-store must round-trip.
 */

import * as SecureStore from 'expo-secure-store';

import { __resetAuthStoreForTests, useAuthStore } from '../useAuthStore';

const { __getSecureStoreMockMemory } = SecureStore as typeof SecureStore & {
  __getSecureStoreMockMemory: () => Map<string, string>;
};

function getMockStore(): Map<string, string> {
  return __getSecureStoreMockMemory();
}

describe('useAuthStore', () => {
  beforeEach(async () => {
    getMockStore().clear();
    await __resetAuthStoreForTests();
  });

  it('initializes empty', () => {
    const { userId, displayName, avatarUrl } = useAuthStore.getState();
    expect(userId).toBeNull();
    expect(displayName).toBeNull();
    expect(avatarUrl).toBeNull();
  });

  it('setUser persists to secure-store with all three fields', async () => {
    useAuthStore.getState().setUser({
      id: 'user_clerk_abc',
      displayName: 'Fontez',
      avatarUrl: 'https://img.example/x.png',
    });

    const state = useAuthStore.getState();
    expect(state.userId).toBe('user_clerk_abc');
    expect(state.displayName).toBe('Fontez');
    expect(state.avatarUrl).toBe('https://img.example/x.png');

    await Promise.resolve();

    // Persistence — Zustand stores the slice under a known secure-store key.
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

  it('clearUser zeroes out and persists the cleared state', async () => {
    useAuthStore.getState().setUser({ id: 'u1', displayName: 'X' });
    useAuthStore.getState().clearUser();

    expect(useAuthStore.getState().userId).toBeNull();
    expect(useAuthStore.getState().displayName).toBeNull();

    await Promise.resolve();

    const raw = getMockStore().get('auth-store');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.userId).toBeNull();
  });

  it('hydrates from existing secure-store state', async () => {
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

    await freshStore!.persist.rehydrate();
    const state = freshStore!.getState();
    expect(state.userId).toBe('pre_existing');
    expect(state.displayName).toBe('Returning User');
  });
});
