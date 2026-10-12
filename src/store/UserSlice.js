// Ported verbatim from Ecommerce-sept-1-2026/src/context/UserSlice.js — the
// `profiles` row (+ `uid`) for the signed-in user, including `role`.
import { createSlice } from '@reduxjs/toolkit';

const userSlice = createSlice({
  name: 'user',
  initialState: { user: null },
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    clearUser: (state) => {
      state.user = null;
    },
  },
});

export const { setUser, clearUser } = userSlice.actions;
export default userSlice.reducer;