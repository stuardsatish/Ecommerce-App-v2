// Ported from Ecommerce-sept-1-2026/src/context/WishlistSlice.js, with ONE
// deliberate fix: the source `removeWishlist` compared the raw (possibly
// non-string) `item.id` against `action.payload`, while `addWishlist` dedupes
// via `String(item.id)` — an id-type mismatch that could leave stale entries
// under certain id shapes (flagged as Unclear Item 9 in MIGRATION_ANALYSIS.md,
// resolved: fix it). Both reducers now consistently compare `String(id)`.
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  wishlistItems: [],
};

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState,
  reducers: {
    setWishlist: (state, action) => {
      state.wishlistItems = action.payload;
    },

    addWishlist: (state, action) => {
      const exists = state.wishlistItems.find(
        (item) => String(item.id) === String(action.payload.id)
      );

      if (!exists) {
        state.wishlistItems.push(action.payload);
      }
    },

    removeWishlist: (state, action) => {
      state.wishlistItems = state.wishlistItems.filter(
        (item) => String(item.id) !== String(action.payload)
      );
    },
  },
});

export const { setWishlist, addWishlist, removeWishlist } = wishlistSlice.actions;
export default wishlistSlice.reducer;