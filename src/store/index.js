// Phase 5 registered `user`, Phase 6 added `cart`/`wishlist`. Phase 8 added
// `products`. Phase 5A adds `savedItems` for save-for-later.
// See Ecommerce-sept-1-2026/src/context/Store.js for the web app's full slice
// set — `loading`/`theme` are deliberately not ported; see MIGRATION_ANALYSIS.md
// Phase 6/3 write-ups for why.
import { configureStore } from '@reduxjs/toolkit';

import cartReducer from './CartSlice';
import productReducer from './ProductSlice';
import savedItemsReducer from './SavedItemsSlice';
import userReducer from './UserSlice';
import wishlistReducer from './WishlistSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    cart: cartReducer,
    wishlist: wishlistReducer,
    products: productReducer,
    savedItems: savedItemsReducer,
  },
});