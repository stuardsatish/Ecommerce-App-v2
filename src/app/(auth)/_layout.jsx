import { Redirect, Stack, usePathname } from 'expo-router';
import { useSelector } from 'react-redux';

/**
 * Edge case found in a post-migration review, not from any single ported
 * source file: reset-password.jsx establishes a real (if temporary)
 * Supabase session via `verifyOtp`/`setSession` so it can later call
 * `auth.updateUser({password})` while authenticated — that's required by
 * Supabase's own recovery flow. But root `_layout.jsx`'s `AuthGate` can't
 * tell a recovery session apart from an ordinary login (neither
 * `setSession`'s SIGNED_IN event nor, in some client versions, even
 * `verifyOtp`'s PASSWORD_RECOVERY event carry a reliable marker this layout
 * could filter on), so it dispatches `setUser` just the same. Without the
 * pathname exemption below, the instant that session lands, `user` goes
 * truthy and this layout's own "already logged in" redirect would yank the
 * user to /products before they can ever type a new password — password
 * reset would be completely non-functional. `updatePassword` (useAuth.js)
 * already calls `signOut()` right after a successful change, so once the
 * user is done, `user` goes false and `reset-password.jsx`'s own
 * `router.replace('/login')` takes over normally.
 */
export default function AuthLayout() {
  const user = useSelector((state) => state.user.user);
  const pathname = usePathname();

  if (user && pathname !== '/reset-password') {
    return <Redirect href="/products" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}