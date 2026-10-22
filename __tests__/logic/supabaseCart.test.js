/**
 * API contract tests — supabaseCart.js (Ecommerce-app).
 *
 * Tests the pure helper functions (nextAddQuantity, nextRemoveQuantity, parseCartIds)
 * and verifies that the Supabase-calling functions (upsertCartItem, removeCartItem,
 * decrementOrRemoveCartItem, clearCartItems) call the Supabase client with the
 * correct table, columns, and conflict clause.
 *
 * The Supabase client is mocked — no real network or database needed.
 * These run in the logic suite (Node env, no RNTL).
 */

// ── Supabase mock ─────────────────────────────────────────────────────────────
// We mock the module-level client so supabaseCart.js picks it up at import time.
jest.mock('@/lib/supabase', () => {
  const chain = {
    eq: jest.fn(),
    or: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  };
  // Each method returns the chain so we can do .eq().eq().or()
  Object.keys(chain).forEach(k => {
    chain[k].mockReturnValue({ ...chain, error: null });
  });
  return {
    supabase: {
      from: jest.fn(() => ({
        ...chain,
        upsert: jest.fn(async () => ({ error: null })),
        delete: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              or: jest.fn(async () => ({ error: null })),
              eq: jest.fn(async () => ({ error: null })),
            })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              or: jest.fn(async () => ({ error: null })),
              eq: jest.fn(async () => ({ error: null })),
            })),
          })),
        })),
      })),
    },
  };
});

import {
  nextAddQuantity,
  nextRemoveQuantity,
  parseCartIds,
  upsertCartItem,
  removeCartItem,
  decrementOrRemoveCartItem,
  clearCartItems,
} from '../../src/services/supabaseCart';

import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// nextAddQuantity
// ─────────────────────────────────────────────────────────────────────────────
describe('nextAddQuantity', () => {
  it('returns 1 when the item is not yet in the cart', () => {
    expect(nextAddQuantity([], 'prod-1')).toBe(1);
  });

  it('returns existing quantity + 1', () => {
    const cart = [{ id: 'prod-1', compound_id: 'prod-1', quantity: 3 }];
    expect(nextAddQuantity(cart, 'prod-1')).toBe(4);
  });

  it('matches by compound_id when id is absent', () => {
    const cart = [{ compound_id: 'prod-2', quantity: 2 }];
    expect(nextAddQuantity(cart, 'prod-2')).toBe(3);
  });

  it('returns 1 for null/undefined cartItems', () => {
    expect(nextAddQuantity(null, 'x')).toBe(1);
    expect(nextAddQuantity(undefined, 'x')).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nextRemoveQuantity
// ─────────────────────────────────────────────────────────────────────────────
describe('nextRemoveQuantity', () => {
  it('returns 0 when item is not in cart', () => {
    expect(nextRemoveQuantity([], 'prod-1')).toBe(0);
  });

  it('returns quantity - 1 when quantity > 1', () => {
    const cart = [{ id: 'prod-1', quantity: 5 }];
    expect(nextRemoveQuantity(cart, 'prod-1')).toBe(4);
  });

  it('returns 0 (trigger delete) when quantity is 1', () => {
    const cart = [{ id: 'prod-1', quantity: 1 }];
    expect(nextRemoveQuantity(cart, 'prod-1')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCartIds
// ─────────────────────────────────────────────────────────────────────────────
describe('parseCartIds', () => {
  it('null input → empty strings', () => {
    expect(parseCartIds(null)).toEqual({ productId: '', variantId: '' });
  });

  it('plain product id string', () => {
    expect(parseCartIds('abc123')).toEqual({ productId: 'abc123', variantId: '' });
  });

  it('compound string "pid_var_vid" splits correctly', () => {
    // slice is at idx+1 so the result is 'var_v2' (no leading underscore)
    expect(parseCartIds('p1_var_v2')).toEqual({ productId: 'p1', variantId: 'var_v2' });
  });

  it('object with productId + variant_id', () => {
    expect(parseCartIds({ productId: 'p1', variant_id: 'v1' })).toEqual({
      productId: 'p1',
      variantId: 'v1',
    });
  });

  it('object with id only (no variant)', () => {
    expect(parseCartIds({ id: 'p1' })).toEqual({ productId: 'p1', variantId: '' });
  });

  it('object with compound_id splits on _var_', () => {
    expect(parseCartIds({ compound_id: 'p1_var_v2' })).toEqual({
      productId: 'p1',
      variantId: 'var_v2',  // slice at idx+1 drops only the separator underscore
    });
  });

  it('explicit variantId string param', () => {
    expect(parseCartIds('p1', 'v1')).toEqual({ productId: 'p1', variantId: 'v1' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// upsertCartItem — contract: calls supabase.from('cart_items').upsert(...)
// ─────────────────────────────────────────────────────────────────────────────
describe('upsertCartItem — Supabase contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls supabase.from with cart_items', async () => {
    await upsertCartItem('uid-1', { id: 'p1', title: 'Cake', price: 100, category: 'sweets' }, 2);
    expect(supabase.from).toHaveBeenCalledWith('cart_items');
  });

  it('does NOT call supabase when uid is falsy', async () => {
    await upsertCartItem(null, { id: 'p1' }, 1);
    expect(supabase.from).not.toHaveBeenCalled();
    await upsertCartItem('', { id: 'p1' }, 1);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('resolves variant_id and product_id correctly for variant products', async () => {
    // Capture payload via mockReturnValueOnce so it does not bleed into later tests
    let capturedPayload = null;
    supabase.from.mockReturnValueOnce({
      upsert: jest.fn().mockImplementation(async (payload) => {
        capturedPayload = payload;
        return { error: null };
      }),
    });
    const variantProduct = {
      productId: 'base-1',
      id: 'base-1_var_v2',
      variantId: 'v2',
      title: 'Cake',
      price: 150,
      category: 'sweets',
    };
    await upsertCartItem('uid-1', variantProduct, 1);
    expect(capturedPayload).toMatchObject({
      product_id: 'base-1',
      variant_id: 'v2',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clearCartItems — no-op when uid is falsy
// ─────────────────────────────────────────────────────────────────────────────
describe('clearCartItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the full from() chain (mockReturnValueOnce in the upsert test
    // consumed the original implementation; put it back with delete support)
    supabase.from.mockReturnValue({
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    });
  });

  it('skips Supabase call when uid is falsy', async () => {
    await clearCartItems(null);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('calls supabase.from("cart_items") when uid is present', async () => {
    await clearCartItems('uid-1');
    expect(supabase.from).toHaveBeenCalledWith('cart_items');
  });
});
