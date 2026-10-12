/**
 * Cart item IDENTITY — the single most defect-prone area in this codebase,
 * because the same logical item is addressed three different ways:
 *
 *   single product   -> id = productId
 *   variant product  -> id = `${productId}_${variantId}`, where variantId
 *                       itself is conventionally `var_<n>`
 *   DB row           -> (user_id, product_id, variant_id) composite key
 *
 * Redux (CartSlice) and the Supabase layer (supabaseCart) must agree on which
 * line an operation targets. When they disagreed, Redux incremented a line to
 * 2 while the DB wrote 1 over it — a silent divergence the user only saw after
 * a reload, when the DB value won.
 */
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const { parseCartIds, nextAddQuantity, nextRemoveQuantity } = require('@/services/supabaseCart');
const reducer = require('@/store/CartSlice').default;
const { addCart, removeCart, deleteCart, clearCart, setCart } = require('@/store/CartSlice');

describe('parseCartIds', () => {
  it('returns empty ids for falsy input', () => {
    expect(parseCartIds(null)).toEqual({ productId: '', variantId: '' });
    expect(parseCartIds('')).toEqual({ productId: '', variantId: '' });
  });

  it('splits a compound string id, preserving the var_ prefix on the variant', () => {
    // `_var_` is the delimiter; slicing at idx+1 keeps the variant's own
    // leading `var_`, which is what the DB stores.
    expect(parseCartIds('prod123_var_7')).toEqual({ productId: 'prod123', variantId: 'var_7' });
  });

  it('treats a plain string id as a single product', () => {
    expect(parseCartIds('prod123')).toEqual({ productId: 'prod123', variantId: '' });
  });

  it('accepts an explicit variantId alongside a plain id', () => {
    expect(parseCartIds('prod123', 'var_9')).toEqual({ productId: 'prod123', variantId: 'var_9' });
  });

  it('prefers explicit object fields over parsing the compound id', () => {
    expect(parseCartIds({ productId: 'p1', variant_id: 'var_2', id: 'ignored_var_99' })).toEqual({
      productId: 'p1',
      variantId: 'var_2',
    });
  });

  it('falls back to parsing an object with only a compound id', () => {
    expect(parseCartIds({ id: 'p5_var_3' })).toEqual({ productId: 'p5', variantId: 'var_3' });
  });

  it('handles a product id that itself contains an underscore', () => {
    // Only `_var_` may be treated as the delimiter, not any underscore.
    expect(parseCartIds('dark_choc_var_2')).toEqual({ productId: 'dark_choc', variantId: 'var_2' });
    expect(parseCartIds('dark_choc')).toEqual({ productId: 'dark_choc', variantId: '' });
  });
});

describe('nextAddQuantity / nextRemoveQuantity', () => {
  it('starts a new line at 1 and increments an existing one', () => {
    expect(nextAddQuantity([], 'p1')).toBe(1);
    expect(nextAddQuantity([{ id: 'p1', quantity: 2 }], 'p1')).toBe(3);
  });

  it('decrements to a floor of 0 (0 meaning "delete the row")', () => {
    expect(nextRemoveQuantity([{ id: 'p1', quantity: 3 }], 'p1')).toBe(2);
    expect(nextRemoveQuantity([{ id: 'p1', quantity: 1 }], 'p1')).toBe(0);
    expect(nextRemoveQuantity([], 'p1')).toBe(0);
  });

  it('matches on compound_id, exactly as CartSlice does', () => {
    // REGRESSION: these matched on `x.id` only while the reducer matched on
    // `x.id || x.compound_id`. For an item carrying only compound_id the
    // reducer found it and went to 2, while these returned 1 and persisted 1.
    const cart = [{ compound_id: 'p1_var_4', quantity: 2 }];
    expect(nextAddQuantity(cart, 'p1_var_4')).toBe(3);
    expect(nextRemoveQuantity(cart, 'p1_var_4')).toBe(1);
  });

  it('agrees with the reducer for both id shapes', () => {
    for (const key of ['id', 'compound_id']) {
      const item = { [key]: 'p9', quantity: 4 };
      const state = { cartItems: [item] };
      const afterAdd = reducer(state, addCart({ id: 'p9', qtyToAdd: 1 }));
      expect(afterAdd.cartItems[0].quantity).toBe(nextAddQuantity([item], 'p9'));

      const afterRemove = reducer(state, removeCart('p9'));
      expect(afterRemove.cartItems[0].quantity).toBe(nextRemoveQuantity([item], 'p9'));
    }
  });

  it('tolerates a null cart', () => {
    expect(nextAddQuantity(null, 'p1')).toBe(1);
    expect(nextRemoveQuantity(null, 'p1')).toBe(0);
  });
});

describe('CartSlice reducers', () => {
  const init = { cartItems: [] };

  it('adds a new item with quantity 1 by default', () => {
    const s = reducer(init, addCart({ id: 'p1', title: 'Bar' }));
    expect(s.cartItems).toHaveLength(1);
    expect(s.cartItems[0]).toMatchObject({ id: 'p1', title: 'Bar', quantity: 1 });
  });

  it('honours an explicit qtyToAdd and strips it from the stored item', () => {
    const s = reducer(init, addCart({ id: 'p1', qtyToAdd: 3 }));
    expect(s.cartItems[0].quantity).toBe(3);
    expect(s.cartItems[0]).not.toHaveProperty('qtyToAdd');
  });

  it('increments rather than duplicating an existing line', () => {
    let s = reducer(init, addCart({ id: 'p1' }));
    s = reducer(s, addCart({ id: 'p1', qtyToAdd: 2 }));
    expect(s.cartItems).toHaveLength(1);
    expect(s.cartItems[0].quantity).toBe(3);
  });

  it('keeps variants of one product as separate lines', () => {
    let s = reducer(init, addCart({ id: 'p1_var_1' }));
    s = reducer(s, addCart({ id: 'p1_var_2' }));
    s = reducer(s, addCart({ id: 'p1' }));
    expect(s.cartItems).toHaveLength(3);
  });

  it('removeCart decrements, then removes the line at 1', () => {
    let s = reducer({ cartItems: [{ id: 'p1', quantity: 2 }] }, removeCart('p1'));
    expect(s.cartItems[0].quantity).toBe(1);
    s = reducer(s, removeCart('p1'));
    expect(s.cartItems).toHaveLength(0);
  });

  it('deleteCart removes the whole line regardless of quantity', () => {
    const s = reducer({ cartItems: [{ id: 'p1', quantity: 9 }] }, deleteCart('p1'));
    expect(s.cartItems).toHaveLength(0);
  });

  it('removeCart on an absent id is a no-op', () => {
    const before = { cartItems: [{ id: 'p1', quantity: 1 }] };
    expect(reducer(before, removeCart('nope')).cartItems).toHaveLength(1);
  });

  it('clearCart empties the cart and setCart replaces it', () => {
    expect(reducer({ cartItems: [{ id: 'a' }] }, clearCart()).cartItems).toEqual([]);
    const replaced = reducer(init, setCart([{ id: 'x', quantity: 5 }]));
    expect(replaced.cartItems).toEqual([{ id: 'x', quantity: 5 }]);
  });

  it('coerces numeric ids to strings so 1 and "1" are the same line', () => {
    let s = reducer(init, addCart({ id: 1 }));
    s = reducer(s, addCart({ id: '1' }));
    expect(s.cartItems).toHaveLength(1);
    expect(s.cartItems[0].quantity).toBe(2);
  });
});