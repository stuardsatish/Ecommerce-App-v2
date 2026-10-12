// Ported from Ecommerce-sept-1-2026/src/services/settingsService.js — READ
// side only (getInvoiceSettings). The write side (saveInvoiceSettings) is
// admin-only, out of scope per MIGRATION_ANALYSIS.md's §2 admin exclusion.
import { supabase } from '@/lib/supabase';

const getSettingsData = async (id) => {
  const { data, error } = await supabase.from('settings').select('data').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.data || null;
};

/**
 * Reads invoice customization details from the settings row id='invoiceSettings'.
 * Returns default values if the row does not exist.
 */
export const getInvoiceSettings = async () => {
  const data = await getSettingsData('invoiceSettings');
  if (data) return data;
  return {
    companyName: 'Nexus Commerce Pvt. Ltd.',
    address: '12 Industrial Layout, Whitefield, Bengaluru, Karnataka 560066',
    mobile: '+91 80 4000 1234',
    email: 'support@nexuscommerce.in',
    gstin: '29ABCDE1234F1Z5',
    state: '',
    website: 'https://nexuscommerce.in',
    footerTitle: 'Thank You!',
    footerSubNote: 'We appreciate your business. Visit Again.',
    supportEmail: 'support@nexuscommerce.in',
    supportPhone: '+91 80 4000 1234',
    upiId: '',
    logo: '',
  };
};

/**
 * Reads shipping estimate settings from the settings row id='shippingSettings'.
 * Returns the same defaults (threshold 500 / cost 49) the cart and
 * `utils/pricing.js` already fall back to, and that the web app's own
 * `getShippingSettings` uses — so an absent row reads identically everywhere.
 */
export const getShippingSettings = async () => {
  const data = await getSettingsData('shippingSettings');
  if (data) {
    return {
      freeShippingThreshold:
        typeof data.freeShippingThreshold === 'number' ? data.freeShippingThreshold : 500,
      shippingCost: typeof data.shippingCost === 'number' ? data.shippingCost : 49,
    };
  }
  return { freeShippingThreshold: 500, shippingCost: 49 };
};

/**
 * Reads the promotional banner / flash-sale content from the settings row
 * id='promoBanner' (roadmap task 2.4).
 *
 * Content-driven by design: this reuses the EXISTING generic `settings` table
 * (jsonb `data` keyed by id), so switching a promotion on, changing its copy,
 * or ending it needs no app release and — importantly — no schema migration
 * against the shared Supabase project.
 *
 * Shape:
 *   {
 *     enabled:   boolean,  // master switch
 *     title:     string,   // e.g. "Flash Sale"
 *     subtitle:  string,   // e.g. "Up to 30% off groceries"
 *     ctaLabel:  string,   // e.g. "Shop now"  (optional)
 *     endsAt:    string,   // ISO timestamp; drives the countdown (optional)
 *     tone:      'primary' | 'accent' | 'success'   // optional, default primary
 *   }
 *
 * Defaults to `enabled: false` when the row is absent, so a deployment that
 * has never configured a promotion simply shows no banner.
 */
export const getPromoBanner = async () => {
  const data = await getSettingsData('promoBanner');
  if (!data) return { enabled: false };
  return {
    enabled: data.enabled === true,
    title: typeof data.title === 'string' ? data.title : '',
    subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
    ctaLabel: typeof data.ctaLabel === 'string' ? data.ctaLabel : '',
    endsAt: typeof data.endsAt === 'string' ? data.endsAt : '',
    tone: ['primary', 'accent', 'success'].includes(data.tone) ? data.tone : 'primary',
  };
};