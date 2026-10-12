/**
 * Cart/pricing maths. This is display-and-estimate math only — the server
 * computes the authoritative charged amount (every order path sends just
 * {productId, variantId, quantity} to an Edge Function). What these tests
 * protect is that the ESTIMATE the customer sees matches what the server will
 * charge, which depends on reproducing the server's rounding ORDER exactly:
 *
 *   subtotal -> Math.round(subtotal) -> + shipping - promo -> max(0, round)
 *
 * Get that order wrong and the displayed total drifts a rupee from the charged
 * total, which is the kind of defect that reaches support tickets rather than
 * crash reports.
 */
const {
  getMrp,
  getDiscount,
  getPrice,
  getStock,
  getMaxStock,
  isDiscountActive,
  computeSubtotal,
  computePromoDiscount,
  computeShippingEstimate,
  computeCartTotals,
} = require('@/utils/pricing');

const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z').getTime();
beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW));
afterEach(() => jest.restoreAllMocks());

const PAST = '2026-01-01T00:00:00.000Z';
const FUTURE = '2026-12-31T00:00:00.000Z';

describe('getMrp / getStock / getMaxStock', () => {
  it('coerces missing and junk values to 0', () => {
    expect(getMrp(null)).toBe(0);
    expect(getMrp({})).toBe(0);
    expect(getMrp({ price: '499.50' })).toBe(499.5);
    expect(getStock({ stock: '7' })).toBe(7);
    expect(getStock({})).toBe(0);
  });

  it('falls back to max(stock, 100) when maxStock is unset', () => {
    expect(getMaxStock({ maxStock: 20 })).toBe(20);
    expect(getMaxStock({ stock: 5 })).toBe(100);
    expect(getMaxStock({ stock: 250 })).toBe(250);
    expect(getMaxStock({})).toBe(100);
  });
});

describe('getDiscount / getPrice', () => {
  it('honours an unexpired discount', () => {
    expect(getDiscount({ discount: 20, discountExpiry: FUTURE })).toBe(20);
    expect(getPrice({ price: 1000, discount: 20, discountExpiry: FUTURE })).toBe(800);
  });

  it('zeroes an expired discount', () => {
    expect(getDiscount({ discount: 20, discountExpiry: PAST })).toBe(0);
    expect(getPrice({ price: 1000, discount: 20, discountExpiry: PAST })).toBe(1000);
  });

  it('honours and zeroes snake_case discount_expiry from Supabase', () => {
    expect(getDiscount({ discount: 20, discount_expiry: FUTURE })).toBe(20);
    expect(getDiscount({ discount: 20, discount_expiry: PAST })).toBe(0);
    expect(getPrice({ price: 1000, discount: 20, discount_expiry: PAST })).toBe(1000);
  });

  it('treats a discount with no expiry as permanent', () => {
    expect(getDiscount({ discount: 15 })).toBe(15);
  });
});

describe('isDiscountActive', () => {
  it('is false without a positive discount', () => {
    expect(isDiscountActive(null)).toBe(false);
    expect(isDiscountActive({})).toBe(false);
    expect(isDiscountActive({ discount: 0 })).toBe(false);
    expect(isDiscountActive({ discount: -5 })).toBe(false);
  });

  it('accepts an ISO string expiry', () => {
    expect(isDiscountActive({ discount: 10, discountExpiry: FUTURE })).toBe(true);
    expect(isDiscountActive({ discount: 10, discountExpiry: PAST })).toBe(false);
  });

  it('accepts an epoch-number expiry', () => {
    expect(isDiscountActive({ discount: 10, discountExpiry: FIXED_NOW + 1000 })).toBe(true);
    expect(isDiscountActive({ discount: 10, discountExpiry: FIXED_NOW - 1000 })).toBe(false);
  });

  it('accepts a Firestore-style Timestamp with toDate()', () => {
    const ts = (iso) => ({ toDate: () => new Date(iso) });
    expect(isDiscountActive({ discount: 10, discountExpiry: ts(FUTURE) })).toBe(true);
    expect(isDiscountActive({ discount: 10, discountExpiry: ts(PAST) })).toBe(false);
  });

  it('stays active when the expiry is unparseable rather than silently expiring', () => {
    // A garbled expiry must not be read as "expired" — that would quietly
    // remove a live discount from the customer's price.
    expect(isDiscountActive({ discount: 10, discountExpiry: 'not-a-date' })).toBe(true);
  });
});

describe('computeSubtotal', () => {
  it('is 0 for an empty or missing cart', () => {
    expect(computeSubtotal([])).toBe(0);
    expect(computeSubtotal(null)).toBe(0);
  });

  it('sums discounted unit price x quantity', () => {
    const cart = [
      { price: 100, quantity: 2 },
      { price: 200, quantity: 1, discount: 50, discountExpiry: FUTURE },
    ];
    expect(computeSubtotal(cart)).toBe(300); // 200 + 100
  });

  it('ignores an expired discount', () => {
    expect(computeSubtotal([{ price: 200, quantity: 1, discount: 50, discountExpiry: PAST }])).toBe(200);
  });

  it('tolerates missing price/quantity', () => {
    expect(computeSubtotal([{}, { price: 50 }, { quantity: 3 }])).toBe(0);
  });
});

describe('computePromoDiscount', () => {
  it('is 0 with no promo', () => {
    expect(computePromoDiscount(1000, null)).toBe(0);
  });

  it('applies a percent promo, rounded', () => {
    expect(computePromoDiscount(1000, { type: 'percent', value: 10 })).toBe(100);
    expect(computePromoDiscount(999, { type: 'percent', value: 10 })).toBe(100); // 99.9 -> 100
  });

  it('applies a flat promo unrounded', () => {
    expect(computePromoDiscount(1000, { type: 'flat', value: 150 })).toBe(150);
  });

  it('is 0 once the promo has expired', () => {
    expect(computePromoDiscount(1000, { type: 'percent', value: 10, expiryDate: PAST })).toBe(0);
    expect(computePromoDiscount(1000, { type: 'percent', value: 10, expiryDate: FUTURE })).toBe(100);
  });
});

describe('computeShippingEstimate', () => {
  const cfg = { freeShippingThreshold: 500, shippingCost: 49 };

  it('charges shipping below the threshold and not at/above it', () => {
    expect(computeShippingEstimate(499, cfg)).toBe(49);
    expect(computeShippingEstimate(500, cfg)).toBe(0); // boundary is inclusive
    expect(computeShippingEstimate(501, cfg)).toBe(0);
  });

  it('defaults to 500/49 when no config is supplied', () => {
    expect(computeShippingEstimate(100)).toBe(49);
    expect(computeShippingEstimate(600)).toBe(0);
  });
});

describe('computeCartTotals — rounding order must mirror the server', () => {
  it('rounds the subtotal BEFORE adding shipping and subtracting promo', () => {
    // subtotal 100.4 -> 100; + 49 shipping - 0 promo = 149.
    // Rounding after adding instead would give round(149.4) = 149 too, so use
    // a case where the two orders differ: 100.5 -> 101 (+49) = 150, whereas
    // round(100.5 + 49) = round(149.5) = 150. Use .4/.6 split on two items.
    const cart = [
      { price: 33.5, quantity: 1 },
      { price: 33.5, quantity: 1 },
      { price: 33.5, quantity: 1 },
    ];
    const t = computeCartTotals(cart, { shippingConfig: { freeShippingThreshold: 1e9, shippingCost: 49 } });
    expect(t.subtotal).toBeCloseTo(100.5, 5);
    expect(t.subtotalRounded).toBe(101); // round happens here
    expect(t.orderTotal).toBe(150); // 101 + 49
  });

  it('returns every intermediate the UI displays', () => {
    const cart = [{ price: 250, quantity: 2 }];
    const t = computeCartTotals(cart, {
      appliedPromo: { type: 'percent', value: 10 },
      shippingConfig: { freeShippingThreshold: 500, shippingCost: 49 },
    });
    expect(t).toEqual({
      subtotal: 500,
      subtotalRounded: 500,
      promoDiscount: 50,
      shippingEstimate: 0, // 500 hits the free-shipping threshold
      orderTotal: 450,
    });
  });

  it('clamps the total at 0 when the promo exceeds the cart value', () => {
    const t = computeCartTotals([{ price: 100, quantity: 1 }], {
      appliedPromo: { type: 'flat', value: 5000 },
      shippingConfig: { freeShippingThreshold: 1e9, shippingCost: 49 },
    });
    expect(t.orderTotal).toBe(0);
    expect(t.orderTotal).not.toBeLessThan(0);
  });

  it('evaluates free shipping on the pre-promo subtotal', () => {
    // Documents the intended business rule: a promo does not push an order
    // back under the free-shipping threshold.
    const t = computeCartTotals([{ price: 600, quantity: 1 }], {
      appliedPromo: { type: 'flat', value: 200 },
      shippingConfig: { freeShippingThreshold: 500, shippingCost: 49 },
    });
    expect(t.shippingEstimate).toBe(0);
    expect(t.orderTotal).toBe(400);
  });

  it('handles an empty cart without producing NaN', () => {
    const t = computeCartTotals([], {});
    expect(t.subtotal).toBe(0);
    expect(t.orderTotal).toBe(49); // shipping still applies to an empty cart
    expect(Number.isNaN(t.orderTotal)).toBe(false);
  });
});