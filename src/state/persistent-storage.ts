// Zustand persist adapter backed by expo-secure-store (encrypted Keychain /
// Keystore). Async — matches how persist already rehydrates. Each persisted
// store's `persist.name` becomes the SecureStore key (valid chars
// [A-Za-z0-9._-], value < 2KB). All persisted slices here are small.
import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

export function createPersistentStorage(): StateStorage {
  return {
    getItem: (name) => SecureStore.getItemAsync(name),
    setItem: (name, value) => SecureStore.setItemAsync(name, value),
    removeItem: (name) => SecureStore.deleteItemAsync(name),
  };
}
