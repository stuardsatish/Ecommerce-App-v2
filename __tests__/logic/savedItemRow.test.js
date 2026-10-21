// Port of Ecommerce-Website-v2-main/src/services/__tests__/savedItemRow.test.mjs (the app's copy takes the line's `image`, not `thumbnail`).
// Regression: "Save for later" built its row WITHOUT user_id, so the database's row-level security (user_id = auth.uid()) refused it.
const { savedItemRow } = require('@/services/savedItemRow');

const line = { id: 'prod_1_var_pink', productId: 'prod_1', variant_id: 'var_pink', variant_name: 'Pink', quantity: 2, title: 'Tee', image: 't.jpg', category: 'Shirts', price: 300, discount: 10, discountExpiry: '2026-12-31T00:00:00Z', selected_variant: { color: 'Pink' } };

describe('savedItemRow', () => {
  it('carries the owner: user_id is always in the row (the RLS check is user_id = auth.uid())', () => {
    const row = savedItemRow(line, 'u-1');
    expect(row.user_id).toBe('u-1');
    expect(Object.keys(row)).toContain('user_id');
  });
  it('maps the cart line to the table columns', () => {
    expect(savedItemRow(line, 'u-1')).toEqual({
      user_id: 'u-1', product_id: 'prod_1', variant_id: 'var_pink', variant_name: 'Pink', selected_variant: { color: 'Pink' }, quantity: 2,
      title: 'Tee', image: 't.jpg', category: 'Shirts', price: 300, discount: 10, discount_expiry: '2026-12-31T00:00:00Z',
    });
  });
  it('defaults: a bare line saves as quantity 1, no variant, empty text, price 0', () => {
    expect(savedItemRow({ id: 'prod_9' }, 'u-1')).toEqual({
      user_id: 'u-1', product_id: 'prod_9', variant_id: '', variant_name: '', selected_variant: null, quantity: 1,
      title: '', image: '', category: '', price: 0, discount: 0, discount_expiry: null,
    });
  });
  it('finds the product id of an old line that only has the compound id', () => {
    expect(savedItemRow({ id: 'prod_5_var_x' }, 'u').product_id).toBe('prod_5');
  });
  it('refuses when nobody is signed in (instead of sending a row the database would refuse)', () => {
    expect(() => savedItemRow(line, '')).toThrow(/sign in/i);
    expect(() => savedItemRow(line, undefined)).toThrow(/sign in/i);
  });
});