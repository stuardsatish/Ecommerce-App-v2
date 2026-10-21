// Remembers the Expo push token this app instance registered for the signed-in customer, so the sign-out flow (hooks/useAuth.js) can unregister it
// BEFORE the session ends: unregister_device_token() deletes the row only for auth.uid(), so after signOut() it can no longer do anything and the
// previous customer's order / refund notifications would keep arriving on a phone someone else is about to use.
// No imports on purpose: useAuth must not pull the native notification modules in just to read a string.
let current = null;

export const rememberPushToken = (token) => {
  current = token || null;
};

export const currentPushToken = () => current;