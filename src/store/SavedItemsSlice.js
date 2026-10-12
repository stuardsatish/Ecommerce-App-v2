// Redux slice for "saved for later" items (roadmap task 5.1).
// The slice mirrors the shape of CartSlice: a flat array of items stored by
// compound id (productId or productId_variantId). The service (savedItems.js)
// is authoritative — this is a local cache so the UI can read synchronously.
import { createSlice } from '@reduxjs/toolkit';

const savedItemsSlice = createSlice({
  name: 'savedItems',
  initialState: { items: [] },
  reducers: {
    setSavedItems: (state, action) => {
      state.items = action.payload;
    },
    addSavedItem: (state, action) => {
      const item = action.payload;
      const key = item.compound_id || item.id;
      if (!state.items.find((x) => (x.compound_id || x.id) === key)) {
        state.items.push(item);
      }
    },
    removeSavedItem: (state, action) => {
      const key = String(action.payload);
      state.items = state.items.filter((x) => (x.compound_id || x.id) !== key);
    },
    clearSavedItems: (state) => {
      state.items = [];
    },
  },
});

export const { setSavedItems, addSavedItem, removeSavedItem, clearSavedItems } =
  savedItemsSlice.actions;
export default savedItemsSlice.reducer;
