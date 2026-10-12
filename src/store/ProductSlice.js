// Ported verbatim from Ecommerce-sept-1-2026/src/context/ProductSlice.js.
// Note the misleading name: `addProduct` REPLACES the whole catalog array
// (it's how ProductsPage dispatches its full fetch result), it doesn't append
// a single product — kept as-is for fidelity with the source app.
import { createSlice } from '@reduxjs/toolkit';

const productSlice = createSlice({
  name: 'products',
  initialState: {
    product: [],
  },
  reducers: {
    addProduct: (state, action) => {
      state.product = action.payload;
    },
    removeProduct: (state, action) => {
      state.product = state.product.filter((product) => product.id !== action.payload);
    },
    removeAllProduct: (state) => {
      state.product = [];
    },
  },
});

export const { addProduct, removeProduct, removeAllProduct } = productSlice.actions;
export default productSlice.reducer;