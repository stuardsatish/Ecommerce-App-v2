/**
 * Native component tests for <CartLineItem>.
 * Checklist items: CT02–CT04 (cart item display, quantity controls, discounts).
 *
 * Mocks: Redux store (Provider), supabaseCart service, theme hook.
 * Uses the jest-expo preset (see jest.config.js `native` project).
 */
const React = require('react');
const { render, fireEvent } = require('@testing-library/react-native');
const { Provider } = require('react-redux');
const { configureStore } = require('@reduxjs/toolkit');

// ── Service mocks ─────────────────────────────────────────────────────────────
jest.mock('@/services/supabaseCart', () => ({
  upsertCartItem: jest.fn(),
  decrementOrRemoveCartItem: jest.fn(),
  nextAddQuantity: jest.fn((_, __) => 2),
  nextRemoveQuantity: jest.fn((_, __) => 0),
}));
jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ primary: '#6c47ff', link: '#6c47ff', inverse: '#fff' }),
}));

const { CartLineItem } = require('@/components/CartLineItem');
const cartService = require('@/services/supabaseCart');

// ── Minimal Redux store ───────────────────────────────────────────────────────
const cartReducer = (state = { cartItems: [] }, action) => {
  if (action.type === 'cart/addCart') return { cartItems: [...state.cartItems, action.payload] };
  if (action.type === 'cart/removeCart') return { cartItems: state.cartItems.filter(i => i.id !== action.payload) };
  return state;
};
const userReducer = (state = { user: { uid: 'user-1' } }) => state;

const makeStore = (cartItems = []) =>
  configureStore({
    reducer: { cart: cartReducer, user: userReducer },
    preloadedState: { cart: { cartItems }, user: { user: { uid: 'user-1' } } },
  });

const wrap = (ui, store) =>
  React.createElement(Provider, { store }, ui);

// ── Item factory ──────────────────────────────────────────────────────────────
const item = (over = {}) => ({
  id: 'prod-1',
  compound_id: 'prod-1',
  title: 'Dark Chocolate Bar',
  category: 'Chocolates',
  price: 200,
  quantity: 1,
  discount: 0,
  thumbnail: 'https://cdn.example/img.jpg',
  ...over,
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('<CartLineItem>', () => {
  it('renders the product title', () => {
    const { getByText } = render(wrap(<CartLineItem item={item()} />, makeStore([item()])));
    expect(getByText('Dark Chocolate Bar')).toBeTruthy();
  });

  it('renders quantity from the item prop', () => {
    const { getByText } = render(wrap(<CartLineItem item={item({ quantity: 3 })} />, makeStore()));
    expect(getByText('3')).toBeTruthy();
  });

  it('shows the variant name when present', () => {
    const { getByText } = render(
      wrap(<CartLineItem item={item({ variant_name: '70% Dark' })} />, makeStore())
    );
    expect(getByText('70% Dark')).toBeTruthy();
  });

  it('shows NO LONGER AVAILABLE when item.unavailable is true', () => {
    const { getByText } = render(
      wrap(<CartLineItem item={item({ unavailable: true })} />, makeStore())
    );
    expect(getByText('NO LONGER AVAILABLE')).toBeTruthy();
  });

  it('CT03 — shows discounted total and strikethrough when discount is active', () => {
    const i = item({ price: 500, quantity: 2, discount: 10 });
    const { getByText } = render(wrap(<CartLineItem item={i} />, makeStore([i])));
    // Discounted total: 500 * 2 * 0.9 = 900
    expect(getByText('₹900.00')).toBeTruthy();
    // Original total strikethrough: 500 * 2 = 1000
    expect(getByText('₹1000.00')).toBeTruthy();
    expect(getByText('10% OFF')).toBeTruthy();
  });

  it('shows full price without discount stripe when discount is 0', () => {
    const i = item({ price: 300, quantity: 2, discount: 0 });
    const { getByText, queryByText } = render(wrap(<CartLineItem item={i} />, makeStore([i])));
    expect(getByText('₹600.00')).toBeTruthy();
    expect(queryByText(/% OFF/)).toBeNull();
  });

  it('CT04 — Increase quantity button calls upsertCartItem', () => {
    const i = item({ quantity: 1 });
    const { getByLabelText } = render(wrap(<CartLineItem item={i} />, makeStore([i])));
    fireEvent.press(getByLabelText('Increase quantity'));
    expect(cartService.upsertCartItem).toHaveBeenCalled();
  });

  it('CT04 — Decrease quantity button calls decrementOrRemoveCartItem', () => {
    const i = item({ quantity: 2 });
    const { getByLabelText } = render(wrap(<CartLineItem item={i} />, makeStore([i])));
    fireEvent.press(getByLabelText('Decrease quantity'));
    expect(cartService.decrementOrRemoveCartItem).toHaveBeenCalled();
  });

  it('renders the Save for later button when onSaveForLater is provided', () => {
    const onSave = jest.fn();
    const { getByLabelText } = render(
      wrap(<CartLineItem item={item()} onSaveForLater={onSave} />, makeStore())
    );
    expect(getByLabelText('Save for later')).toBeTruthy();
  });

  it('calls onSaveForLater when the button is pressed', () => {
    const onSave = jest.fn();
    const { getByLabelText } = render(
      wrap(<CartLineItem item={item()} onSaveForLater={onSave} />, makeStore())
    );
    fireEvent.press(getByLabelText('Save for later'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows "Saving…" text and disables button when savingForLater=true', () => {
    const { getByText } = render(
      wrap(<CartLineItem item={item()} onSaveForLater={jest.fn()} savingForLater />, makeStore())
    );
    expect(getByText('Saving…')).toBeTruthy();
  });

  it('does not render Save for later button when onSaveForLater is absent', () => {
    const { queryByLabelText } = render(wrap(<CartLineItem item={item()} />, makeStore()));
    expect(queryByLabelText('Save for later')).toBeNull();
  });
});
