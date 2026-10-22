/**
 * In-memory AsyncStorage mock for the logic test suite.
 * Mapped via moduleNameMapper in jest.config.js:
 *   "@react-native-async-storage/async-storage" -> this file
 *
 * Provides the same interface as the real AsyncStorage so searchHistory.js
 * and any other module that imports it can be tested without React Native.
 */
const store = new Map();

const AsyncStorage = {
  getItem: jest.fn(async (key) => store.get(key) ?? null),
  setItem: jest.fn(async (key, value) => { store.set(key, String(value)); }),
  removeItem: jest.fn(async (key) => { store.delete(key); }),
  clear: jest.fn(async () => { store.clear(); }),
  getAllKeys: jest.fn(async () => [...store.keys()]),
  multiGet: jest.fn(async (keys) => keys.map((k) => [k, store.get(k) ?? null])),
  multiSet: jest.fn(async (pairs) => { for (const [k, v] of pairs) store.set(k, v); }),
  multiRemove: jest.fn(async (keys) => { for (const k of keys) store.delete(k); }),

  /** Expose the backing store so tests can seed or inspect it directly. */
  __store: store,
  __reset: () => { store.clear(); jest.clearAllMocks(); },
};

module.exports = AsyncStorage;
