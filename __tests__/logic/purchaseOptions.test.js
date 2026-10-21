// Port (1:1) of Ecommerce-Website-v2-main/src/features/products/__tests__/purchaseOptions.test.mjs.
// src/utils/purchaseOptions.js is a COPY of the web module; this file keeps the two in sync — change one, change both.
const {
  listVariants,
  getMainOption,
  getPurchaseOptions,
  isAvailable,
  defaultOption,
  optionForVariantId,
  cartCompoundId,
  buildCartPayload,
  policyLine,
  policySummary,
  listPriceSummary,
  hasAvailableOption,
  formatINR,
  needsOptionChoice,
  listStockSummary,
} = require('@/utils/purchaseOptions');
const { mapProductRow, mapOrderRow } = require('@/utils/mappers');

// what mapProductRow() produces for the Designer Shirt example from the brief
const shirt = (o = {}) => ({
  id: 'prod_shirt',
  title: 'Designer Shirt',
  price: 500,
  stock: 10,
  sku: 'DESIGNER-SHIRT',
  thumbnail: 'main.jpg',
  hasVariants: true,
  mainOptionEnabled: true,
  trackInventory: true,
  returnEnabled: true,
  returnWindowDays: 7,
  exchangeEnabled: true,
  exchangeWindowDays: 5,
  variants: [
    { id: 'var_1_0', name: 'Pink', price: 300, stock: 20, sku: 'DS-PINK', image: 'pink.jpg' },
    { id: 'var_1_1', name: 'White', price: 200, stock: 30, sku: 'DS-WHITE', image: '', return_enabled: false, exchange_enabled: true, exchange_window_days: 3 },
    { id: 'var_1_2', name: 'Violet', price: 350, stock: 15, sku: 'DS-VIOLET', image: '' },
  ],
  ...o,
});
const single = (o = {}) => ({
  id: 'prod_one', title: 'Classic Cotton Shirt', price: 500, stock: 50, sku: 'SHIRT-001', hasVariants: false, variants: [],
  mainOptionEnabled: true, trackInventory: true, returnEnabled: true, returnWindowDays: 7, exchangeEnabled: false, exchangeWindowDays: null, ...o,
});

describe('the options of a product', () => {
  it('SINGLE: exactly one option — the product itself, no fake variant', () => {
    const o = getPurchaseOptions(single());
    expect(o).toHaveLength(1);
    expect([o[0].kind, o[0].variantId, o[0].price, o[0].stock, o[0].sku]).toEqual(['single', '', 500, 50, 'SHIRT-001']);
  });

  it('WITH VARIANTS: the main product is a purchasable option of its OWN, followed by every variant', () => {
    const o = getPurchaseOptions(shirt());
    expect(o.map((x) => [x.kind, x.name, x.price, x.stock, x.sku])).toEqual([
      ['main', 'Designer Shirt', 500, 10, 'DESIGNER-SHIRT'],
      ['variant', 'Pink', 300, 20, 'DS-PINK'],
      ['variant', 'White', 200, 30, 'DS-WHITE'],
      ['variant', 'Violet', 350, 15, 'DS-VIOLET'],
    ]);
    expect(o[0].label).toBe('Main product');
  });

  it('prices and stock are independent: nothing is summed, averaged or minimised', () => {
    const o = getPurchaseOptions(shirt({ price: 999, stock: 0 }));
    expect(o.map((x) => x.price)).toEqual([999, 300, 200, 350]);
    expect(o.map((x) => x.stock)).toEqual([0, 20, 30, 15]);
  });

  it('main option OFF: only the variants are offered', () => {
    expect(getPurchaseOptions(shirt({ mainOptionEnabled: false })).map((x) => x.name)).toEqual(['Pink', 'White', 'Violet']);
    expect(getMainOption(shirt({ mainOptionEnabled: false }))).toBeNull();
  });

  it('inactive variants are never offered', () => {
    const p = shirt();
    p.variants[1].status = 'inactive';
    expect(listVariants(p).map((v) => v.name)).toEqual(['Pink', 'Violet']);
    expect(getPurchaseOptions(p).map((x) => x.name)).toEqual(['Designer Shirt', 'Pink', 'Violet']);
  });

  it('a variant product whose variants are all gone degrades to a plain single option', () => {
    expect(getPurchaseOptions(shirt({ variants: [] })).map((x) => x.kind)).toEqual(['single']);
  });

  it('untracked inventory => stock null => always available', () => {
    const o = getPurchaseOptions(shirt({ trackInventory: false, stock: 0 }));
    expect(o[0].stock).toBeNull();
    expect(isAvailable(o[0])).toBe(true);
    const p = shirt();
    p.variants[0].track_inventory = false;
    p.variants[0].stock = 0;
    expect(isAvailable(getPurchaseOptions(p)[1])).toBe(true);
    expect(isAvailable(getPurchaseOptions(shirt({ stock: 0 }))[0])).toBe(false);
  });
});

describe('default selection', () => {
  it('the main option when it can be bought', () => expect(defaultOption(shirt()).kind).toBe('main'));
  it('the first variant IN STOCK when the main option is off or sold out', () => {
    expect(defaultOption(shirt({ mainOptionEnabled: false })).name).toBe('Pink');
    const p = shirt({ stock: 0 });
    p.variants[0].stock = 0;
    expect(defaultOption(p).name).toBe('White');
  });
  it('falls back to the first option when nothing is in stock (so the page can show "out of stock")', () => {
    const p = shirt({ stock: 0 });
    p.variants.forEach((v) => { v.stock = 0; });
    expect(defaultOption(p).kind).toBe('main');
    expect(hasAvailableOption(p)).toBe(false);
    expect(defaultOption({ id: 'x', variants: [], hasVariants: false, price: 0, stock: 0 }).kind).toBe('single');
    expect(defaultOption(null)).toBeNull();
  });
  it('optionForVariantId resolves "" to the main option', () => {
    expect(optionForVariantId(shirt(), '').kind).toBe('main');
    expect(optionForVariantId(shirt(), 'var_1_2').name).toBe('Violet');
    expect(optionForVariantId(shirt(), 'var_nope')).toBeNull();
  });
});

describe('cart identity and payload', () => {
  const p = shirt();
  const [main, pink, white] = getPurchaseOptions(p);

  it('independent line identities: product id for main, productId_variantId for a variant', () => {
    expect(cartCompoundId(p, main)).toBe('prod_shirt');
    expect(cartCompoundId(p, pink)).toBe('prod_shirt_var_1_0');
    expect(cartCompoundId(p, pink)).not.toBe(cartCompoundId(p, white));
  });
  it('main payload is the product itself (no variant fields) — buying it adds NO variant', () => {
    const payload = buildCartPayload(p, main);
    expect(payload).toBe(p);
    expect(payload).not.toHaveProperty('variant_id');
  });
  it("variant payload carries the variant's own id, name, price, stock and image — and not the main price", () => {
    const payload = buildCartPayload(p, pink);
    expect([payload.variant_id, payload.variant_name, payload.price, payload.stock, payload.image, payload.thumbnail]).toEqual(['var_1_0', 'Pink', 300, 20, 'pink.jpg', 'pink.jpg']);
    expect(payload.selected_variant.sku).toBe('DS-PINK');
    expect(payload.title).toBe('Designer Shirt');
    expect(p.price).toBe(500); // not mutated
  });
  it('a variant without an image falls back to the product image', () => {
    expect(buildCartPayload(p, white).image).toBe('main.jpg');
  });
  it('untracked variant gets a large stock cap instead of null (the cart UI clamps on it)', () => {
    const q = shirt();
    q.variants[0].track_inventory = false;
    expect(buildCartPayload(q, getPurchaseOptions(q)[1]).stock).toBe(999999);
  });
});

describe('return / exchange policy per option (independent; variant may override, NULL inherits)', () => {
  const [main, pink, white] = getPurchaseOptions(shirt());
  it('main uses the product policy; an inheriting variant uses the product policy too', () => {
    expect(policySummary(main)).toBe('7-day returns · 5-day exchange');
    expect(policySummary(pink)).toBe('7-day returns · 5-day exchange');
  });
  it('an overriding variant uses its own pair, independently for return and exchange', () => {
    expect(policySummary(white)).toBe('Not returnable · 3-day exchange');
  });
  it('both OFF and the singular/plural forms', () => {
    const none = getPurchaseOptions(single({ returnEnabled: false, returnWindowDays: null, exchangeEnabled: false }))[0];
    expect(policySummary(none)).toBe('Not returnable · No exchange');
    expect(policyLine('return', { enabled: true, days: 10 })).toBe('10-day returns');
    expect(policyLine('exchange', { enabled: true, days: 1 })).toBe('1-day exchange');
    expect(policySummary(null)).toBe('');
  });
});

describe('list price presentation (never a bare minimum price)', () => {
  it('single product: just the price', () => expect(listPriceSummary(single())).toEqual({ price: 500, prefix: '', note: '' }));
  it('variants + main on sale: the MAIN price, plus an explicit note about the others', () => {
    expect(listPriceSummary(shirt())).toEqual({ price: 500, prefix: '', note: '+ 3 more options · ₹200 – ₹350' });
  });
  it('main not sold: "From <lowest>" with the range spelled out', () => {
    expect(listPriceSummary(shirt({ mainOptionEnabled: false }))).toEqual({ price: 200, prefix: 'From', note: '3 options · ₹200 – ₹350' });
  });
  it('one variant / equal prices read naturally', () => {
    const p = shirt({ variants: [{ id: 'v', name: 'A', price: 300, stock: 1 }] });
    expect(listPriceSummary(p).note).toBe('+ 1 more option · ₹300');
    const q = shirt({ mainOptionEnabled: false, variants: [{ id: 'a', name: 'A', price: 300, stock: 1 }, { id: 'b', name: 'B', price: 300, stock: 1 }] });
    expect(listPriceSummary(q)).toEqual({ price: 300, prefix: 'From', note: '2 options · ₹300' });
  });
  it('formatINR', () => {
    expect(formatINR(1500)).toBe('₹1,500');
    expect(formatINR('abc')).toBe('₹0');
  });
});

describe('RN mappers expose the purchasable-option fields without breaking the old shape', () => {
  it('mapProductRow: new columns map; a PRE-migration row (none of them) behaves as before', () => {
    const post = mapProductRow({ id: 'p1', main_option_enabled: false, track_inventory: false, tags: ['a'], return_enabled: false, return_window_days: null, exchange_enabled: true, exchange_window_days: 5 });
    expect([post.mainOptionEnabled, post.trackInventory, post.tags, post.returnEnabled, post.returnWindowDays, post.exchangeEnabled, post.exchangeWindowDays]).toEqual([false, false, ['a'], false, null, true, 5]);
    const legacy = mapProductRow({ id: 'p2' });
    expect([legacy.mainOptionEnabled, legacy.trackInventory, legacy.tags, legacy.returnEnabled, legacy.exchangeEnabled]).toEqual([true, true, [], true, true]);
  });
  it('mapOrderRow: item snapshot fields map; legacy items have empty snapshot; still NO price/mrp field', () => {
    const o = mapOrderRow({
      id: 'o1',
      order_items: [
        { id: 'oi1', product_id: 'p1', variant_id: 'var_x', variant_name: 'Pink', title: 'T [Pink]', quantity: 2, unit_price: 270, line_total: 540,
          item_type: 'variant', sku: 'S-P', product_title: 'T', image: 'i.jpg', snapshot_source: 'order', return_enabled: true, return_window_days: 7, exchange_enabled: false, exchange_window_days: null },
        { product_id: 'p2', title: 'Old', quantity: 1, unit_price: 10, line_total: 10 },
      ],
    });
    const [a, b] = o.products;
    expect([a.id, a.itemType, a.sku, a.productTitle, a.snapshotImage, a.snapshotSource, a.variantId, a.variantName]).toEqual(['oi1', 'variant', 'S-P', 'T', 'i.jpg', 'order', 'var_x', 'Pink']);
    expect(a.policy).toEqual({ returnEnabled: true, returnWindowDays: 7, exchangeEnabled: false, exchangeWindowDays: null });
    expect([b.id, b.itemType, b.sku, b.snapshotSource, b.policy]).toEqual([null, '', '', '', null]);
    for (const it of [a, b]) {
      expect(it).not.toHaveProperty('price');
      expect(it).not.toHaveProperty('mrp');
      expect(it).not.toHaveProperty('originalPrice');
    }
  });
});

// Port of the web describe('list cards: choose-options CTA and availability')
describe('list cards: choose-options CTA and availability', () => {
  it('a single product is added straight from the card', () => expect(needsOptionChoice(single())).toBe(false));
  it('a variant product with its main option on sale needs a choice (never add the main product by accident)', () => {
    expect(needsOptionChoice(shirt())).toBe(true);
  });
  it('main option off: still a choice — even when only ONE variant is left, the only thing on sale is a variant', () => {
    expect(needsOptionChoice(shirt({ mainOptionEnabled: false }))).toBe(true);
    expect(needsOptionChoice(shirt({ mainOptionEnabled: false, variants: [{ id: 'only', name: 'Only', price: 10, stock: 1 }] }))).toBe(true);
  });
  it('a variant product whose variants are all gone is a plain single product again', () => {
    expect(needsOptionChoice(shirt({ variants: [] }))).toBe(false);
    expect(needsOptionChoice(null)).toBe(false);
  });

  it('single: the units are the product stock and the card shows the number', () => {
    expect(listStockSummary(single())).toEqual({ out: false, units: 50, multi: false });
    expect(listStockSummary(single({ stock: 0 }))).toEqual({ out: true, units: 0, multi: false });
  });
  it('variants: out ONLY when no option at all can be bought', () => {
    expect(listStockSummary(shirt())).toEqual({ out: false, units: 75, multi: true });
    // a sold-out MAIN counter must not hide the in-stock variants
    expect(listStockSummary(shirt({ stock: 0 }))).toEqual({ out: false, units: 65, multi: true });
    const all = shirt({ stock: 0 });
    all.variants.forEach((v) => { v.stock = 0; });
    expect(listStockSummary(all)).toEqual({ out: true, units: 0, multi: true });
  });
  it('untracked inventory is unlimited: no number to show', () => {
    expect(listStockSummary(single({ trackInventory: false, stock: 0 }))).toEqual({ out: false, units: null, multi: false });
    const p = shirt();
    p.variants[0].track_inventory = false;
    expect(listStockSummary(p)).toEqual({ out: false, units: null, multi: true });
  });
  it('inactive variants and a disabled main option do not count towards availability', () => {
    const p = shirt({ mainOptionEnabled: false });
    p.variants[0].status = 'inactive';
    expect(listStockSummary(p)).toEqual({ out: false, units: 45, multi: true });
  });
});