// Ported verbatim from Ecommerce-sept-1-2026/src/utils/supabaseProducts.js and
// src/utils/supabaseOrders.js — these are pure snake_case → camelCase row
// normalizers with no DOM/browser dependency, so they port unchanged.

import { mapShipmentRows } from '@/utils/shipmentModel';

/** Maps a `products` row (snake_case) to the camelCase shape used throughout the app. */
export const mapProductRow = (row) => {
  if (!row) return row;
  return {
    id: row.id,
    productId: row.id,
    title: row.title || '',
    description: row.description || '',
    shortDescription: row.short_description || '',
    category: row.category || '',
    brand: row.brand || '',
    badge: row.badge || '',
    sku: row.sku || '',
    price: Number(row.price) || 0,
    priceType: row.price_type || 'inclusive',
    discount: Number(row.discount) || 0,
    discountExpiry: row.discount_expiry || '',
    gstRate: Number(row.gst_rate) || 0,
    hsnCode: row.hsn_code || '',
    stock: Number(row.stock) || 0,
    maxStock: row.max_stock,
    image: row.image || '',
    thumbnail: row.thumbnail || row.image || '',
    gallery: row.gallery || [],
    rating: Number(row.rating) || 0,
    reviewCount: Number(row.review_count) || 0,
    status: row.status || 'active',
    createdAt: row.created_at,
    // Variant / combination product fields
    hasVariants: Boolean(row.has_variants),
    // products.variants is a trigger-maintained CACHE of the ACTIVE rows of product_variants
    // ([{id,name,price,stock,sku,image,track_inventory,return_*,exchange_*}]) — all the app needs.
    variants: Array.isArray(row.variants) ? row.variants : [],
    attributes: Array.isArray(row.attributes) ? row.attributes : [],

    // ── Purchasable-option model (migration 20261014_01). Defaults keep pre-migration rows behaving as before.
    // May the MAIN product itself be bought when it also has variants? (always true for a single product)
    mainOptionEnabled: row.main_option_enabled !== false,
    trackInventory: row.track_inventory !== false,
    tags: Array.isArray(row.tags) ? row.tags : [],
    // Return / exchange policy of the main (or only) option. null window = that policy is OFF.
    returnEnabled: row.return_enabled !== false,
    returnWindowDays: row.return_window_days ?? null,
    exchangeEnabled: row.exchange_enabled !== false,
    exchangeWindowDays: row.exchange_window_days ?? null,
  };
};

export const mapProductRows = (rows) => (rows || []).map(mapProductRow);

// Maps `orders` + `order_items` rows (snake_case, per 01-schema.sql) to the
// camelCase shape the rest of the app was built around when orders lived in
// Firestore. All reads from the orders table should go through this normalizer.
//
// IMPORTANT — resolvedFinalPrice compatibility:
//   AdminOrdersPage (web, admin-only, not ported here) has a `resolvedFinalPrice`
//   helper that detects an old Firestore-backend bug where finalPrice was stored
//   equal to the MRP. It fires when `disc > 0 && stored >= mrp && mrp > 0`. To
//   prevent that branch from double-discounting Supabase order items (where
//   unit_price IS already the correct post-discount price), we intentionally do
//   NOT expose a `price` field on mapped items so that mrp resolves to 0 and the
//   condition `mrp > 0` stays false. `finalPrice` alone is enough for every UI
//   consumer.
export const mapOrderRow = (row) => {
  if (!row) return row;
  const items = (row.order_items || []).map((it) => ({
    productId: it.product_id,
    variantId: it.variant_id || null,
    variantName: it.variant_name || null,
    title: it.title || '',
    quantity: Number(it.quantity) || 1,
    // unit_price is the final charged price per unit (already discounted).
    finalPrice: Number(it.unit_price) || 0,
    discount: Number(it.discount) || 0,
    lineTotal: Number(it.line_total) || 0,

    // ── Purchase-time snapshot (migration 20261014_01). Pre-migration rows have none of this (all undefined/empty).
    // order_items.id is THE key for everything after delivery (return / exchange / refund of ONE line).
    id: it.id || null,
    // 'single' | 'main' | 'variant' (the product-page option that was bought); '' for rows older than the migration
    itemType: it.item_type || '',
    sku: it.sku || '',
    productTitle: it.product_title || '',
    snapshotImage: it.image || '',
    snapshotSource: it.snapshot_source || '', // 'order' (exact) | 'backfill' (reconstructed from the title)
    // The return / exchange policy that applied when it was bought (null = unknown/legacy -> use the product's)
    policy:
      it.return_enabled == null && it.exchange_enabled == null
        ? null
        : {
            returnEnabled: it.return_enabled !== false,
            returnWindowDays: it.return_window_days ?? null,
            exchangeEnabled: it.exchange_enabled !== false,
            exchangeWindowDays: it.exchange_window_days ?? null,
          },
    // NB: still NO `price` / `mrp` field — see the resolvedFinalPrice note above.
  }));

  // address is jsonb in Supabase — expose under all aliases the UI checks.
  const addr = row.address;

  return {
    id: row.id,
    userId: row.user_id,
    orderStatus: row.order_status || 'placed',
    paymentStatus: row.payment_status || 'pending',
    paymentMethod: row.payment_method || '',
    source: row.source || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    // Schema uses customer_* not user_*; re-expose under the camelCase names
    // the rest of the UI expects.
    userName: row.customer_name || '',
    userEmail: row.customer_email || '',
    userPhone: row.customer_phone || '',

    // address is jsonb; expose under all aliases the UI checks
    userAddress: addr,
    address: addr,
    shippingAddress: addr,

    // financial fields
    subtotal: Number(row.subtotal) || 0,
    shipping: Number(row.shipping) || 0,
    total: Number(row.total) || 0,
    promoCode: row.promo_code || '',
    promoDiscount: Number(row.promo_discount) || 0,

    // GST breakdown (stored as cgst/sgst/igst on the orders row)
    totalCgst: Number(row.cgst) || 0,
    totalSgst: Number(row.sgst) || 0,
    totalIgst: Number(row.igst) || 0,

    // Razorpay IDs
    razorpayOrderId: row.razorpay_order_id || '',
    razorpayPaymentId: row.razorpay_payment_id || '',

    // order_items mapped to `products` (UI-facing name for the line-items array)
    products: items,

    // Shipping (migration 20261017_03_shipping.sql). Empty / null on a server without it or when nothing was shipped yet.
    // deliveredAt anchors every return / exchange window; deliveredAtSource 'backfill_updated_at' = approximate.
    deliveredAt: row.delivered_at || null,
    deliveredAtSource: row.delivered_at_source || '',
    shipments: mapShipmentRows(row.shipments),
  };
};

export const mapOrderRows = (rows) => (rows || []).map(mapOrderRow);

/**
 * Resolves the accurate image for an order line item.
 * Prioritizes the specific variant's image when variantId or variant title matches,
 * falling back to base product thumbnail/image.
 */
export const resolveOrderItemImage = (item, product) => {
  if (!product) return item?.thumbnail || item?.image || '';
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    let v = null;
    const vid = item?.variantId || item?.variant_id;
    if (vid) {
      v = product.variants.find((x) => String(x.id) === String(vid));
    }
    if (!v && item?.title) {
      const bracketMatch = item.title.match(/\[(.*?)\]/);
      const variantNameInBracket = bracketMatch ? bracketMatch[1].trim().toLowerCase() : null;
      if (variantNameInBracket) {
        v = product.variants.find(
          (x) => x.name && x.name.trim().toLowerCase() === variantNameInBracket
        );
      }
      if (!v) {
        v = product.variants.find(
          (x) => x.name && item.title.toLowerCase().includes(x.name.trim().toLowerCase())
        );
      }
    }
    if (v && v.image) {
      return v.image;
    }
  }
  return product.thumbnail || product.image || item?.thumbnail || item?.image || '';
};