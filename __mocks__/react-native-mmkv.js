// In-memory shim for react-native-mmkv v4 during Jest runs. v4 exposes
// `createMMKV(config)` as a factory function — not a class constructor.
//
// The storage Map is anchored on globalThis so jest.isolateModules
// re-evaluating this mock doesn't blow away the data; that matches the real
// MMKV's behavior of persisting through JS module reloads (it's a native
// OS-backed store).

if (!globalThis.__MMKV_MOCK_STORES__) {
  globalThis.__MMKV_MOCK_STORES__ = new Map();
}
const stores = globalThis.__MMKV_MOCK_STORES__;

function storeFor(id) {
  let s = stores.get(id);
  if (!s) {
    s = new Map();
    stores.set(id, s);
  }
  return s;
}

function buildInstance(id) {
  const data = storeFor(id);
  return {
    id,
    set(key, value) {
      data.set(key, value);
    },
    getString(key) {
      const v = data.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber(key) {
      const v = data.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    getBoolean(key) {
      const v = data.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    contains(key) {
      return data.has(key);
    },
    remove(key) {
      data.delete(key);
      return true;
    },
    clearAll() {
      data.clear();
    },
    getAllKeys() {
      return Array.from(data.keys());
    },
    // Test-only escape hatch — lets tests inspect the underlying Map.
    _store: data,
  };
}

function createMMKV(config = {}) {
  return buildInstance(config.id ?? 'default');
}

// Test helper: read the underlying Map for a given id without going through
// the public API. Avoids the test having to import MMKV (which is type-only
// in v4) just to spy on persisted state.
function __getMmkvMockStore(id) {
  return storeFor(id);
}

module.exports = { createMMKV, __getMmkvMockStore };
