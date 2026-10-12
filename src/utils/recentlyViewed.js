import AsyncStorage from '@react-native-async-storage/async-storage';

// Most-recent-first list of product ids the user has opened a PDP for.
// Local-only (AsyncStorage), capped so it can't grow unbounded on a device
// that's never cleared storage.
const STORAGE_KEY = 'recentlyViewedProductIds';
const MAX_ENTRIES = 20;

export const getRecentlyViewedIds = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch (err) {
    console.log('getRecentlyViewedIds error:', err);
    return [];
  }
};

export const addRecentlyViewed = async (productId) => {
  if (!productId) return;
  const id = String(productId);
  try {
    const existing = await getRecentlyViewedIds();
    const deduped = [id, ...existing.filter((existingId) => existingId !== id)].slice(
      0,
      MAX_ENTRIES
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  } catch (err) {
    console.log('addRecentlyViewed error:', err);
  }
};