import AsyncStorage from '@react-native-async-storage/async-storage';

// Most-recent-first list of search terms the user has actually submitted.
// Local-only (AsyncStorage), capped, same shape as `recentlyViewed.js` —
// dedup-and-move-to-front so re-running an old search promotes it rather than
// duplicating it.
//
// Deliberately records only SUBMITTED terms (enter key, or tapping a
// suggestion), never raw keystrokes: storing every prefix would fill the list
// with "c", "ca", "cat" and bury anything useful.
const STORAGE_KEY = 'recentSearchTerms';
const MAX_ENTRIES = 8;
const MIN_LENGTH = 2;

export const getRecentSearches = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const terms = raw ? JSON.parse(raw) : [];
    return Array.isArray(terms) ? terms : [];
  } catch (err) {
    console.log('getRecentSearches error:', err);
    return [];
  }
};

export const addRecentSearch = async (term) => {
  const cleaned = String(term || '').trim();
  if (cleaned.length < MIN_LENGTH) return;
  try {
    const existing = await getRecentSearches();
    // Case-insensitive dedup, but the newly typed casing is what's kept —
    // matching how the user last wrote it.
    const deduped = [
      cleaned,
      ...existing.filter((t) => t.toLowerCase() !== cleaned.toLowerCase()),
    ].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  } catch (err) {
    console.log('addRecentSearch error:', err);
  }
};

export const removeRecentSearch = async (term) => {
  try {
    const existing = await getRecentSearches();
    const next = existing.filter((t) => t.toLowerCase() !== String(term).toLowerCase());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.log('removeRecentSearch error:', err);
  }
};

export const clearRecentSearches = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.log('clearRecentSearches error:', err);
  }
};