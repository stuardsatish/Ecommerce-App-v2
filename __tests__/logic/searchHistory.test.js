/**
 * Logic tests for src/utils/searchHistory.js (Ecommerce-app).
 *
 * AsyncStorage is mapped to the in-memory mock via jest.config.js moduleNameMapper.
 * We grab the backing store from the mock to seed and inspect state directly.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from '../../src/utils/searchHistory';

beforeEach(() => {
  AsyncStorage.__reset();
});

describe('getRecentSearches', () => {
  it('returns [] when storage is empty', async () => {
    const r = await getRecentSearches();
    expect(r).toEqual([]);
  });

  it('returns parsed array from storage', async () => {
    AsyncStorage.__store.set('recentSearchTerms', JSON.stringify(['chocolate', 'cake']));
    const r = await getRecentSearches();
    expect(r).toEqual(['chocolate', 'cake']);
  });

  it('returns [] on corrupted JSON (graceful)', async () => {
    AsyncStorage.__store.set('recentSearchTerms', 'not-json!!!');
    const r = await getRecentSearches();
    expect(r).toEqual([]);
  });
});

describe('addRecentSearch', () => {
  it('adds a new term at the front', async () => {
    await addRecentSearch('cake');
    const r = await getRecentSearches();
    expect(r[0]).toBe('cake');
  });

  it('ignores terms shorter than 2 chars', async () => {
    await addRecentSearch('a');
    expect(await getRecentSearches()).toEqual([]);
  });

  it('ignores blank / whitespace-only input', async () => {
    await addRecentSearch('   ');
    expect(await getRecentSearches()).toEqual([]);
  });

  it('deduplicates case-insensitively (latest casing wins)', async () => {
    AsyncStorage.__store.set('recentSearchTerms', JSON.stringify(['chocolate', 'cake']));
    await addRecentSearch('CHOCOLATE');
    const r = await getRecentSearches();
    expect(r[0]).toBe('CHOCOLATE');
    expect(r.filter((t) => t.toLowerCase() === 'chocolate')).toHaveLength(1);
  });

  it('caps the list at 8 entries', async () => {
    for (let i = 1; i <= 10; i++) await addRecentSearch(`term${i}`);
    const r = await getRecentSearches();
    expect(r.length).toBe(8);
  });

  it('trims leading/trailing whitespace from the stored term', async () => {
    await addRecentSearch('  truffles  ');
    expect((await getRecentSearches())[0]).toBe('truffles');
  });
});

describe('removeRecentSearch', () => {
  it('removes the specified term case-insensitively', async () => {
    AsyncStorage.__store.set('recentSearchTerms', JSON.stringify(['cake', 'chocolate', 'truffle']));
    await removeRecentSearch('CHOCOLATE');
    const r = await getRecentSearches();
    expect(r).not.toContain('chocolate');
    expect(r).toContain('cake');
    expect(r).toContain('truffle');
  });

  it('no-ops when term is not in the list', async () => {
    AsyncStorage.__store.set('recentSearchTerms', JSON.stringify(['cake']));
    await removeRecentSearch('nonexistent');
    expect(await getRecentSearches()).toEqual(['cake']);
  });
});

describe('clearRecentSearches', () => {
  it('empties the list', async () => {
    AsyncStorage.__store.set('recentSearchTerms', JSON.stringify(['cake', 'chocolate']));
    await clearRecentSearches();
    expect(await getRecentSearches()).toEqual([]);
  });
});
