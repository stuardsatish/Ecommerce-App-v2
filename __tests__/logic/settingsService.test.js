/**
 * API contract tests — settingsService.js (Ecommerce-app).
 *
 * Verifies that each settings reader:
 *   1. Returns sensible defaults when the Supabase row is absent.
 *   2. Returns the DB row's values when it exists.
 *   3. Sanitises / coerces types (e.g. non-number shippingCost → default).
 *
 * The Supabase client is mocked at the module level.
 */
jest.mock('@/lib/supabase', () => {
  // We'll configure returnValue per test
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: {
      from: jest.fn(() => chain),
    },
    __chain: chain,  // expose for per-test overrides
  };
});

import { supabase } from '@/lib/supabase';

// Helper: configure the mock to return a specific settings row
function mockRow(data) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: data !== null ? { data } : null,
      error: null,
    }),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

function mockError(error) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error }),
  };
  supabase.from.mockReturnValue(chain);
}

import {
  getInvoiceSettings,
  getShippingSettings,
  getReturnPolicyDefaults,
  getPromoBanner,
} from '../../src/services/settingsService';

// ─────────────────────────────────────────────────────────────────────────────
// getInvoiceSettings
// ─────────────────────────────────────────────────────────────────────────────
describe('getInvoiceSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SS-C01 — returns defaults when DB row is absent', async () => {
    mockRow(null);
    const s = await getInvoiceSettings();
    expect(s.companyName).toBeTruthy();
    expect(s.gstin).toBeTruthy();
    expect(s.email).toMatch(/@/);
    expect(typeof s.footerTitle).toBe('string');
  });

  it('SS-C02 — returns DB values when row exists', async () => {
    mockRow({ companyName: 'Test Corp', gstin: '27TEST1234F1Z9', email: 'test@corp.in', footerTitle: 'Thanks' });
    const s = await getInvoiceSettings();
    expect(s.companyName).toBe('Test Corp');
    expect(s.gstin).toBe('27TEST1234F1Z9');
    expect(s.email).toBe('test@corp.in');
  });

  it('SS-C03 — queries the settings table with id=invoiceSettings', async () => {
    const chain = mockRow(null);
    await getInvoiceSettings();
    expect(supabase.from).toHaveBeenCalledWith('settings');
    expect(chain.eq).toHaveBeenCalledWith('id', 'invoiceSettings');
  });

  it('SS-C04 — throws when DB returns an error', async () => {
    mockError({ message: 'DB error', code: '500' });
    await expect(getInvoiceSettings()).rejects.toMatchObject({ message: 'DB error' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getShippingSettings
// ─────────────────────────────────────────────────────────────────────────────
describe('getShippingSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SS-C05 — defaults to 500 threshold / 49 cost when row absent', async () => {
    mockRow(null);
    const s = await getShippingSettings();
    expect(s.freeShippingThreshold).toBe(500);
    expect(s.shippingCost).toBe(49);
  });

  it('SS-C06 — returns DB values when row has valid numbers', async () => {
    mockRow({ freeShippingThreshold: 750, shippingCost: 99 });
    const s = await getShippingSettings();
    expect(s.freeShippingThreshold).toBe(750);
    expect(s.shippingCost).toBe(99);
  });

  it('SS-C07 — falls back to defaults when DB values are non-numeric', async () => {
    mockRow({ freeShippingThreshold: 'free', shippingCost: null });
    const s = await getShippingSettings();
    expect(s.freeShippingThreshold).toBe(500);
    expect(s.shippingCost).toBe(49);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPromoBanner
// ─────────────────────────────────────────────────────────────────────────────
describe('getPromoBanner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SS-C08 — returns { enabled: false } when row absent', async () => {
    mockRow(null);
    const b = await getPromoBanner();
    expect(b.enabled).toBe(false);
  });

  it('SS-C09 — returns banner data when enabled is true', async () => {
    mockRow({ enabled: true, title: 'Flash Sale', subtitle: '30% off', ctaLabel: 'Shop', tone: 'accent', endsAt: '2026-12-31T23:59:59Z' });
    const b = await getPromoBanner();
    expect(b.enabled).toBe(true);
    expect(b.title).toBe('Flash Sale');
    expect(b.tone).toBe('accent');
  });

  it('SS-C10 — coerces invalid tone to primary', async () => {
    mockRow({ enabled: true, title: 'x', tone: 'invalid-tone' });
    const b = await getPromoBanner();
    expect(b.tone).toBe('primary');
  });

  it('SS-C11 — non-boolean enabled is treated as false', async () => {
    mockRow({ enabled: 'yes', title: 'x' });
    const b = await getPromoBanner();
    expect(b.enabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getReturnPolicyDefaults — pass-through
// ─────────────────────────────────────────────────────────────────────────────
describe('getReturnPolicyDefaults', () => {
  it('SS-C12 — returns null when row absent', async () => {
    mockRow(null);
    const result = await getReturnPolicyDefaults();
    expect(result).toBeNull();
  });

  it('SS-C13 — returns raw data object from DB', async () => {
    mockRow({ returnWindow: 7, exchangeWindow: 14 });
    const result = await getReturnPolicyDefaults();
    expect(result).toMatchObject({ returnWindow: 7, exchangeWindow: 14 });
  });
});
