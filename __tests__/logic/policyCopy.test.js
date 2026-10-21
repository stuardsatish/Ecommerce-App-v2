// Port (1:1) of Ecommerce-Website-v2-main/src/features/products/__tests__/policyCopy.test.mjs.
// src/utils/policyCopy.js is a COPY of the web module; this file keeps the two in sync — change one, change both.
const { DEFAULT_RETURN_POLICY, normalizeReturnPolicyDefaults, returnPolicyCopy } = require('@/utils/policyCopy');

describe('normalizeReturnPolicyDefaults', () => {
  it('a missing / malformed document gives the 7 / 7 store defaults', () => {
    for (const bad of [undefined, null, 'x', 42, []]) {
      expect(normalizeReturnPolicyDefaults(bad)).toEqual({ ...DEFAULT_RETURN_POLICY, noReturnCategories: [], noExchangeCategories: [] });
    }
  });
  it('keeps valid values; a disabled side has NO window', () => {
    const n = normalizeReturnPolicyDefaults({ returnEnabled: true, returnWindowDays: 14, exchangeEnabled: false, exchangeWindowDays: 5 });
    expect([n.returnEnabled, n.returnWindowDays, n.exchangeEnabled, n.exchangeWindowDays]).toEqual([true, 14, false, null]);
  });
  it('an out-of-range / fractional / string window falls back to 7 instead of printing nonsense', () => {
    for (const v of [0, -1, 366, 7.5, 'abc', null]) expect(normalizeReturnPolicyDefaults({ returnWindowDays: v }).returnWindowDays).toBe(7);
    expect(normalizeReturnPolicyDefaults({ returnWindowDays: '10' }).returnWindowDays).toBe(10);
  });
  it('category lists are trimmed and blank entries dropped', () => {
    expect(normalizeReturnPolicyDefaults({ noReturnCategories: [' Sweets ', '', null, 'Gifts'], noExchangeCategories: 'x' }).noReturnCategories).toEqual(['Sweets', 'Gifts']);
    expect(normalizeReturnPolicyDefaults({ noExchangeCategories: 'x' }).noExchangeCategories).toEqual([]);
  });
});

describe('returnPolicyCopy: the static policy pages read the STORE values, not a number baked into the source', () => {
  it('defaults: 7 days, product page pointer, exchanges paragraph', () => {
    const c = returnPolicyCopy(undefined);
    expect(c.returns).toHaveLength(2);
    expect(c.returns[0]).toMatch(/Each product has its own return and exchange policy/);
    expect(c.returns[1]).toMatch(/within 7 days of delivery/);
    expect(c.exchanges).toHaveLength(1);
    expect(c.exchanges[0]).toMatch(/exchange window shown on its product page/);
  });
  it('the window follows the setting, with the singular form', () => {
    expect(returnPolicyCopy({ returnWindowDays: 10, exchangeWindowDays: 3 }).returns[1]).toMatch(/within 10 days of delivery/);
    expect(returnPolicyCopy({ returnWindowDays: 1, exchangeWindowDays: 1 }).returns[1]).toMatch(/within 1 day of delivery/);
  });
  it('returns switched OFF store-wide: no number is promised', () => {
    const c = returnPolicyCopy({ returnEnabled: false, returnWindowDays: null, exchangeWindowDays: 7 });
    expect(c.returns[1]).not.toMatch(/within \d+ day/);
    expect(c.returns[1]).toMatch(/as soon as possible after delivery/);
  });
  it('exchanges switched OFF store-wide', () => {
    expect(returnPolicyCopy({ exchangeEnabled: false, exchangeWindowDays: null, returnWindowDays: 7 }).exchanges[0]).toMatch(/Exchanges are not offered unless a product page says so/);
  });
  it('names the categories the store marked non-returnable / non-exchangeable (Q-1) — singular and plural', () => {
    const one = returnPolicyCopy({ returnWindowDays: 7, exchangeWindowDays: 7, noReturnCategories: ['Fresh sweets'], noExchangeCategories: ['Custom gifts', 'Cakes'] });
    expect(one.returns).toHaveLength(3);
    expect(one.returns[2]).toMatch(/^Products in this category are not returnable unless they arrive damaged, defective or different from what you ordered: Fresh sweets\.$/);
    expect(one.exchanges).toHaveLength(2);
    expect(one.exchanges[1]).toMatch(/^Products in these categories cannot be exchanged: Custom gifts and Cakes\.$/);
    expect(returnPolicyCopy({ noReturnCategories: ['A', 'B', 'C'] }).returns[2]).toMatch(/: A, B and C\.$/);
  });
});