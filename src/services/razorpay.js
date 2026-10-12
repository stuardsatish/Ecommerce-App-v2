// createRazorpayOrder/createCodOrder/verifyRazorpayPayment are ported
// verbatim from Ecommerce-sept-1-2026/src/utils/razorpay.js — pure Edge
// Function wrappers, no changes needed. `loadRazorpayScript` (which injects
// the web Checkout.js <script> tag) has no RN equivalent and isn't ported;
// `react-native-razorpay`'s native checkout (opened via RazorpayCheckout.open,
// see below) replaces that role entirely.
import RazorpayCheckout from 'react-native-razorpay';

import { callFunction } from '@/lib/edgeFunctions';

/**
 * Create a Razorpay order on the backend. The client sends only the cart's
 * { productId, quantity } pairs plus an optional promoCode string (the server
 * prices from the catalog and validates the code — never a client-supplied
 * amount).
 * @param {{ items: Array<{productId:string, quantity:number}>, promoCode?: string }} params
 * @returns {Promise<{orderId:string, amount:number, currency:string, subtotal:number, shipping:number, promoDiscount:number, total:number, keyId:string}>}
 */
export async function createRazorpayOrder({ items, promoCode }) {
  const { res, data } = await callFunction('payment-create-order', {
    items,
    promoCode: promoCode || '',
  });
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Could not start payment. Please try again.');
  }
  return data;
}

/**
 * Place a Cash-on-Delivery order on the backend. Like createRazorpayOrder,
 * the client sends only { productId, quantity } pairs + an optional
 * promoCode; the server prices from the catalog, validates the delivery
 * address & stock, and writes the order with paymentMethod:"COD",
 * paymentStatus:"pending".
 * @param {{ items: Array<{productId:string, quantity:number}>, promoCode?: string }} params
 * @returns {Promise<{ success:boolean, orderId:string }>}
 */
export async function createCodOrder({ items, promoCode }) {
  const { res, data } = await callFunction('payment-cod-create', {
    items,
    promoCode: promoCode || '',
  });
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Could not place your COD order. Please try again.');
  }
  return data;
}

/**
 * Verify a completed payment's signature on the backend.
 * @param {{razorpay_order_id:string, razorpay_payment_id:string, razorpay_signature:string}} payload
 */
export async function verifyRazorpayPayment(payload) {
  const { res, data } = await callFunction('payment-verify', payload);
  if (!res.ok || !data.verified) {
    throw new Error(data.error || 'Payment could not be verified.');
  }
  return data;
}

/**
 * Opens the native Razorpay checkout UI. RN equivalent of the web app's
 * `new window.Razorpay(options)` + `.open()` — `RazorpayCheckout.open()`
 * (react-native-razorpay) is a single Promise-based call that presents the
 * native checkout activity/view controller and resolves with
 * {razorpay_payment_id, razorpay_order_id, razorpay_signature} on success or
 * rejects with {code, description} on failure/cancellation. There is no
 * separate `modal.ondismiss`/`payment.failed` event wiring to port — both
 * collapse into the Promise's reject path here.
 * @param {object} options Razorpay Standard Checkout options (key, amount, currency, order_id, name, description, prefill, theme, ...)
 */
export function openRazorpayCheckout(options) {
  return RazorpayCheckout.open(options);
}