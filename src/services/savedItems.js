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
import { mapProductRow } from '@/utils/mappers';
import { isAvailable, optionForVariantId } from '@/utils/purchaseOptions';

import { store } from '../store';
import { savedItemRow } from './savedItemRow';
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

/**
 * snake_case DB row → camelCase item matching the cart-item shape.
 * The id follows the CART convention: `${productId}_${variantId}` (variant ids already start with "var_", so the old
 * `_var_${variantId}` produced "P_var_var_x", which never matched the cart's "P_var_x").
 */
function fromRow(row) {
  const cartId = row.product_id + (row.variant_id ? `_${row.variant_id}` : '');
  return {
    id: cartId,
    compound_id: cartId,
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

  // The row must carry user_id (no column default; RLS is user_id = auth.uid()) - see savedItemRow.js.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const row = savedItemRow(cartItem, session?.user?.id);

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
 * Reads the LIVE product and resolves THE OPTION that was saved (the main product or that specific variant): its own
 * price and stock apply — the old code clamped a variant to the PARENT's stock and priced it at the parent's price.
 * Refuses an option that is out of stock or no longer sold.
 */
export async function moveSavedToCart(savedItem) {
  const { data: row } = await supabase
    .from('products')
    .select('*')
    .eq('id', savedItem.productId)
    .maybeSingle();
  const product = row ? mapProductRow(row) : null;

  let option = null;
  if (product) {
    option = optionForVariantId(product, savedItem.variant_id || '');
    if (!option) throw new Error(`${savedItem.title || 'This item'} is no longer available.`);
    if (!isAvailable(option)) throw new Error(`${savedItem.title || 'This item'} is out of stock.`);
  }

  // stock === null means "inventory not tracked" (always available)
  const liveStock = option && option.stock !== null ? Number(option.stock) : null;
  const qty =
    liveStock !== null
      ? Math.min(savedItem.quantity, liveStock)
      : savedItem.quantity;

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
      variant_name: option ? option.name : savedItem.variant_name,
      selected_variant: option ? option.variant : savedItem.selected_variant,
      title: savedItem.title,
      image: (option && option.image) || savedItem.image,
      category: savedItem.category,
      // The cart row stores the option's LIST price plus the product-level discount separately (exactly like the
      // product page does). The old code wrote an already-discounted price AND the discount, i.e. discounted twice.
      price: option ? option.price : savedItem.price,
      discount: product ? product.discount : savedItem.discount,
      discountExpiry: product ? product.discountExpiry || null : savedItem.discountExpiry,
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