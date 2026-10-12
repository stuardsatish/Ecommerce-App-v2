// Save-for-later service (roadmap task 5.1 [Mobile]).
// Backed by `public.saved_items` (20261008_03_cart_enhancements.sql, applied).
// Table shape mirrors cart_items: product_id, variant_id (NOT NULL, default ''),
// variant_name, selected_variant jsonb, quantity 1..999, title, image, category,
// price, discount, discount_expiry, saved_at. UNIQUE(user_id, product_id, variant_id).
//
// Graceful degradation: a PGRST202/42P01 from the table means the migration
// isn't on this backend yet → warn once, return empty, hide the UI section.
import { supabase } from '@/lib/supabase';
import { deleteCart, setCart } from '@/store/CartSlice';
import { setSavedItems } from '@/store/SavedItemsSlice';
import { getPrice, getStock, isDiscountActive } from '@/utils/pricing';

import { store } from '../store';
import { upsertCartItem } from './supabaseCart';

const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);
let warnedMissing = false;
function isMissing(err) {
  return (
    MISSING_CODES.has(err?.code) ||
    String(err?.message || '').toLowerCase().includes('schema cache')
  );
}
function warnOnce(err) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('[savedItems] save-for-later backend not available; hiding section.', err?.message || '');
}

/** snake_case DB row → camelCase item matching the cart-item shape. */
function fromRow(row) {
  return {
    id: row.product_id + (row.variant_id ? `_var_${row.variant_id}` : ''),
    compound_id: row.product_id + (row.variant_id ? `_var_${row.variant_id}` : ''),
    productId: row.product_id,
    variant_id: row.variant_id || '',
    variant_name: row.variant_name || '',
    selected_variant: row.selected_variant || null,
    quantity: row.quantity,
    title: row.title || '',
    image: row.image || '',
    category: row.category || '',
    price: row.price,
    discount: row.discount,
    discountExpiry: row.discount_expiry,
    savedAt: row.saved_at,
  };
}

/** Load all saved items for the signed-in user and sync Redux. */
export async function listSavedItems() {
  const { data, error } = await supabase
    .from('saved_items')
    .select('*')
    .order('saved_at', { ascending: false });
  if (error) {
    if (isMissing(error)) {
      warnOnce(error);
      return [];
    }
    throw new Error(error.message || 'Could not load saved items.');
  }
  const items = (data || []).map(fromRow);
  store.dispatch(setSavedItems(items));
  return items;
}

/**
 * Move a cart item to the saved-for-later list.
 * Upserts into saved_items (adding quantities on conflict) and removes the
 * item from both Redux and the DB cart_items table.
 */
export async function saveForLater(cartItem) {
  const productId = cartItem.productId || String(cartItem.id || '').split('_var_')[0];
  const variantId = cartItem.variant_id || '';

  const row = {
    product_id: productId,
    variant_id: variantId,
    variant_name: cartItem.variant_name || '',
    selected_variant: cartItem.selected_variant || null,
    quantity: cartItem.quantity || 1,
    title: cartItem.title || '',
    image: cartItem.image || '',
    category: cartItem.category || '',
    price: cartItem.price || 0,
    discount: cartItem.discount || 0,
    discount_expiry: cartItem.discountExpiry || null,
  };

  const { error } = await supabase.from('saved_items').upsert(row, {
    onConflict: 'user_id,product_id,variant_id',
    ignoreDuplicates: false,
  });
  if (error) {
    if (isMissing(error)) {
      warnOnce(error);
      throw new Error("Save for later isn't available right now.");
    }
    throw new Error(error.message || 'Could not save item for later.');
  }

  // Remove from cart in DB and Redux
  const itemKey = cartItem.compound_id || cartItem.id;
  await supabase
    .from('cart_items')
    .delete()
    .eq('product_id', productId)
    .eq('variant_id', variantId);
  store.dispatch(deleteCart(String(itemKey)));

  await listSavedItems();
}

/**
 * Move a saved item back to the cart.
 * Reads the LIVE product to clamp quantity to stock, refuses at 0.
 */
export async function moveSavedToCart(savedItem) {
  // Fetch live product to check stock
  const { data: product } = await supabase
    .from('products')
    .select('stock, price, discount, discount_expiry')
    .eq('id', savedItem.productId)
    .maybeSingle();

  const liveStock = product ? getStock(product) : null;
  if (liveStock !== null && liveStock === 0) {
    throw new Error(`${savedItem.title || 'This item'} is out of stock.`);
  }
  const qty =
    liveStock !== null
      ? Math.min(savedItem.quantity, liveStock)
      : savedItem.quantity;

  // Upsert into cart with live price data
  const livePrice = product ? getPrice(product) : savedItem.price;
  const liveDiscount = product ? (product.discount || 0) : savedItem.discount;
  const liveExpiry = product
    ? product.discount_expiry || null
    : savedItem.discountExpiry;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error('Please sign in to move items to your cart.');

  await upsertCartItem(
    uid,
    {
      productId: savedItem.productId,
      variantId: savedItem.variant_id,
      variant_name: savedItem.variant_name,
      selected_variant: savedItem.selected_variant,
      title: savedItem.title,
      image: savedItem.image,
      category: savedItem.category,
      price: livePrice,
      discount: liveDiscount,
      discountExpiry: liveExpiry,
    },
    qty
  );

  // Remove from saved_items
  const { error } = await supabase
    .from('saved_items')
    .delete()
    .eq('product_id', savedItem.productId)
    .eq('variant_id', savedItem.variant_id);
  if (error && !isMissing(error)) {
    throw new Error(error.message || 'Could not move item to cart.');
  }

  await listSavedItems();

  if (liveStock !== null && qty < savedItem.quantity) {
    return { clamped: true, clampedTo: qty };
  }
  return { clamped: false };
}

/** Remove a saved item without putting it back in the cart. */
export async function removeSavedItem(savedItem) {
  const { error } = await supabase
    .from('saved_items')
    .delete()
    .eq('product_id', savedItem.productId)
    .eq('variant_id', savedItem.variant_id);
  if (error && !isMissing(error)) {
    throw new Error(error.message || 'Could not remove saved item.');
  }
  await listSavedItems();
}

/** List available coupons from the RPC (gracefully hides if missing/empty). */
export async function listAvailableCoupons() {
  const { data, error } = await supabase.rpc('list_available_coupons');
  if (error) {
    if (isMissing(error)) {
      warnOnce(error);
      return [];
    }
    throw new Error(error.message || 'Could not load coupons.');
  }
  return data || [];
}

/**
 * Human-readable coupon description, pure (matches web's describeCoupon).
 * { code, type:'percent'|'flat', value, expiry_date }
 */
export function describeCoupon(coupon) {
  if (!coupon) return '';
  const val =
    coupon.type === 'percent'
      ? `${coupon.value}% off`
      : `₹${coupon.value} off`;
  const expiry = coupon.expiry_date
    ? ` · Valid till ${new Date(coupon.expiry_date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
    : '';
  return `${val}${expiry}`;
}

/**
 * Sync the Redux cart from DB (used after a move-to-cart to refresh quantities).
 * Call supabaseCart's loadCartItems after moveSavedToCart if you need a full reload.
 */
export { setCart } from '@/store/CartSlice';
