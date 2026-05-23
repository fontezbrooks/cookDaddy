// Auth store: the slice of Clerk identity we keep client-side for fast
// cold-start (no flash of "Welcome" before the users-row network fetch).
// Clerk itself owns the session token via Clerk's token cache; this store
// only mirrors the user profile fields needed for UI chrome.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createMmkvStorage } from './mmkv';

type AuthUser = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

type AuthState = {
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
};

const initialState = {
  userId: null,
  displayName: null,
  avatarUrl: null,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,
      setUser: (user) =>
        set({
          userId: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl ?? null,
        }),
      clearUser: () => set({ ...initialState }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => createMmkvStorage('cookdaddy-auth')),
    },
  ),
);

// Test-only hook: drops the persisted state and forces the store to re-hydrate
// from MMKV. Returns the rehydration Promise so tests can await it before
// asserting. Production code never imports this.
export function __resetAuthStoreForTests(): Promise<void> {
  useAuthStore.setState({ ...initialState });
  return (useAuthStore.persist.rehydrate() ?? Promise.resolve()) as Promise<void>;
}
