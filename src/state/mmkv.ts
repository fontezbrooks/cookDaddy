// MMKV v4 adapter for Zustand persist middleware. Each Zustand store that
// needs persistence gets its own MMKV instance (own `id`) so cleanup,
// encryption, or migration can be scoped per-domain in the future.
//
// In v4 MMKV is a function (createMMKV), not a class. Cached per id so the
// same Zustand store always lands on the same backing storage.

import { createMMKV, type MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const instances = new Map<string, MMKV>();

function getInstance(id: string): MMKV {
  const existing = instances.get(id);
  if (existing) return existing;
  const created = createMMKV({ id });
  instances.set(id, created);
  return created;
}

export function createMmkvStorage(id: string): StateStorage {
  return {
    getItem: (name) => getInstance(id).getString(name) ?? null,
    setItem: (name, value) => getInstance(id).set(name, value),
    removeItem: (name) => {
      getInstance(id).remove(name);
    },
  };
}
