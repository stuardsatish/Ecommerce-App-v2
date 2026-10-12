// Ported from Ecommerce-sept-1-2026/src/pages/ProductsPage/ProductsPage.jsx
// (getMrp/getDiscount/getPrice/getStock/getMaxStock) and
// src/pages/CartPage/CartPage.jsx (isDiscountActive + the subtotal/promo/
// shipping/total pipeline).
//
// IMPORTANT: this is DISPLAY/ESTIMATE math only. The client never computes the
// authoritative charged price — every order-creation path sends only
// {productId, variantId, quantity} to a Supabase Edge Function and trusts the
// returned amount (see supabase/functions/_shared/pricing.ts on the backend).
// The exact rounding order here (round the subtotal to whole rupees BEFORE
// adding shipping/promo) intentionally mirrors the server so the displayed
// estimate matches what will actually be charged.

/** `product.price` is the MRP. */
export const getMrp = (product) => Number(product?.price || 0);

/** Discount %, zeroed out once `discountExpiry` has passed. */
export const getDiscount = (product) => {
  if (product?.discountExpiry) {
    const expiry = new Date(product.discountExpiry).getTime();
    if (Date.now() > expiry) return 0;
  }
  return Number(product?.discount || 0);
};

/** MRP minus the active discount. */
export const getPrice = (product) => {
  const mrp = getMrp(product);
  const discount = getDiscount(product);
  return mrp - (mrp * discount) / 100;
};

export const getStock = (product) => Number(product?.stock || 0);

export const getMaxStock = (product) =>
  Number(product?.maxStock || 0) || Math.max(getStock(product), 100);

/**
 * Same discount-expiry check as getDiscount, but for a cart line item (which
 * carries its own frozen `discount`/`discountExpiry` snapshot rather than a
 * live product). Handles the same string/number/Firestore-Timestamp expiry
 * shapes the source app defensively handles.
 */
export const isDiscountActive = (item) => {
  if (!item) return false;
  const disc = Number(item.discount || 0);
  if (disc <= 0) return false;
  if (item.discountExpiry) {
    const val = item.discountExpiry;
    let expiry = NaN;
    if (typeof val === 'string') {
      expiry = new Date(val).getTime();
      if (Number.isNaN(expiry)) {
        const cleanStr = val.replace(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(AM|PM)/i, '$1 $2 $3');
        expiry = new Date(cleanStr).getTime();
      }
    } else if (val?.toDate) {
      expiry = val.toDate().getTime();
    } else if (typeof val === 'number') {
      expiry = val;
    }
    if (!Number.isNaN(expiry) && Date.now() > expiry) {
      return false;
    }
  }
  return true;
};

/** Sum of (discounted unit price × quantity) across cart line items. */
export const computeSubtotal = (cartItems) =>
  (cartItems || []).reduce((sum, item) => {
    const price = Number(item.price || 0);
    const quantity = Number(item.quantity || 0);
    const discount = isDiscountActive(item) ? Number(item.discount || 0) : 0;
    const discountedPrice = price - (price * discount) / 100;
    return sum + discountedPrice * quantity;
  }, 0);

/**
 * Percent/flat promo discount against a subtotal, honoring an expiry date.
 * `appliedPromo` shape: {code, type: 'percent'|'flat', value, expiryDate?}.
 */
export const computePromoDiscount = (subtotal, appliedPromo) => {
  if (!appliedPromo) return 0;
  if (appliedPromo.expiryDate) {
    const expiry = new Date(appliedPromo.expiryDate).getTime();
    if (Date.now() > expiry) return 0;
  }
  return appliedPromo.type === 'percent'
    ? Math.round((subtotal * Number(appliedPromo.value || 0)) / 100)
    : Number(appliedPromo.value || 0);
};

const DEFAULT_SHIPPING_CONFIG = { freeShippingThreshold: 500, shippingCost: 49 };

/** 0 once the subtotal clears the free-shipping threshold, else the flat fee. */
export const computeShippingEstimate = (subtotal, shippingConfig = DEFAULT_SHIPPING_CONFIG) =>
  subtotal >= shippingConfig.freeShippingThreshold ? 0 : shippingConfig.shippingCost;

/**
 * Full cart total pipeline, in the exact order the server mirrors:
 * subtotal → subtotalRounded (whole rupees) → + shipping − promo → total.
 * Returns every intermediate value since the UI displays each one separately.
 */
export const computeCartTotals = (cartItems, { appliedPromo, shippingConfig } = {}) => {
  const subtotal = computeSubtotal(cartItems);
  const promoDiscount = computePromoDiscount(subtotal, appliedPromo);
  const shippingEstimate = computeShippingEstimate(subtotal, shippingConfig ?? DEFAULT_SHIPPING_CONFIG);
  const subtotalRounded = Math.round(subtotal);
  const orderTotal = Math.max(0, Math.round(subtotalRounded + shippingEstimate - promoDiscount));

  return { subtotal, subtotalRounded, promoDiscount, shippingEstimate, orderTotal };
};