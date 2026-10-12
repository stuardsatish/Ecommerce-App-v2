/**
 * Minimal stand-in for the source web app's `react-toastify`.
 *
 * Every user screen in `Ecommerce-sept-29-2026` confirms actions through
 * `toast.success` / `toast.error` / `toast.info` (add-to-cart, promo applied,
 * order placed, review submitted, profile saved, …). Before this module the RN
 * port had no equivalent, so those confirmations were either dropped entirely
 * or raised as `Alert.alert` — a blocking, OS-modal dialog that needs a tap to
 * dismiss, which is a different interaction from a toast that fades by itself.
 *
 * The API is deliberately the same shape as react-toastify's so ported call
 * sites read identically to the web source. Rendering lives in
 * `@/components/ToastHost`, mounted once at the root layout.
 *
 * Position: the web `<ToastContainer position="top-right" autoClose={3000} />`
 * is a desktop-shaped placement. This uses the source's OWN mobile toast
 * treatment instead — MyProfile.jsx's bottom-centred dark pill sitting above
 * the tab bar — since that is the toast design the mobile view actually has.
 * The 3000 ms auto-dismiss matches `autoClose`.
 *
 * Known limitation: on iOS an RN `<Modal>` renders in its own native window,
 * so a toast raised while a bottom sheet is still open can be covered by it.
 * Call sites close the sheet first (as the source does), so this doesn't bite
 * in practice.
 */
const listeners = new Set();
let nextId = 1;

function emit(type, message) {
  if (!message) return;
  const entry = { id: nextId++, type, message: String(message) };
  listeners.forEach((fn) => fn(entry));
  return entry.id;
}

export function subscribeToToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const toast = {
  success: (message) => emit('success', message),
  error: (message) => emit('error', message),
  info: (message) => emit('info', message),
};