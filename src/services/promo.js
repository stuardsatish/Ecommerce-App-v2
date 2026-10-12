// Ported verbatim from Ecommerce-sept-1-2026/src/utils/promo.js. `promo_codes`
// has no client-select RLS policy (admin-only), so the code is validated
// through the `promo-validate` Edge Function, which returns only the resolved
// discount for this code + subtotal — the authoritative discount is still
// recomputed server-side in `payment-create-order` at actual checkout (Phase 11).
import { callFunction } from '@/lib/edgeFunctions';

/**
 * @param {string} code
 * @param {number} subtotal
 * @returns {Promise<{ code: string, type: 'percent'|'flat', value: number, discount: number }>}
 * @throws {Error} with a user-friendly message on invalid/expired/failed codes
 */
export async function validatePromoCode(code, subtotal) {
  const { res, data } = await callFunction('promo-validate', { code, subtotal });
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Could not validate promo code.');
  }
  return data;
}