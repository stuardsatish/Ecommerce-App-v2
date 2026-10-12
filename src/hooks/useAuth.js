// Real auth hook, replacing the Phase 2/3 mock-auth scaffolding. Ported from
// the Supabase call sequences in Ecommerce-sept-1-2026/src/pages/LoginPage,
// SignupPage, ResetPasswordPage.
//
// NOT ported: the cross-tab BroadcastChannel "another tab is already logged
// in, auto-logout it" step from LoginPage.handleLogin (src/utils/sessionUtils.js).
// That's a multi-browser-tab concept with no meaning in a single-instance
// mobile app — dropping it entirely is intentional, per MIGRATION_ANALYSIS.md
// §4's component migration matrix.
import * as Linking from 'expo-linking';
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';

import { supabase } from '@/lib/supabase';
import { clearUser, setUser } from '@/store/UserSlice';
import { clearLocalSession, registerNewSession } from '@/utils/sessionManager';

export const getAuthErrorMessage = (error) => {
  const msg = String(error?.message || '');
  if (msg.includes('Invalid login credentials')) return 'Incorrect email or password';
  if (msg.includes('Email not confirmed')) return 'Please verify your email before logging in';
  if (msg.includes('Unable to validate email')) return 'Invalid email format';
  return msg || 'Something went wrong. Please try again.';
};

export function useAuth() {
  const dispatch = useDispatch();

  /** Signs in, fetches the profiles row, and registers this device's session. */
  const login = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(getAuthErrorMessage(error));

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('User profile not found');
      }

      // Single-session: overwrite any active session on other devices.
      dispatch(setUser({ ...profile, uid: data.user.id }));
      await registerNewSession(data.user.id);
      return profile;
    },
    [dispatch]
  );

  /**
   * Creates the auth user; the `on_auth_user_created` DB trigger creates the
   * `profiles` row from this metadata, which is why every field is passed
   * here rather than in a follow-up `.update()` (before email confirmation
   * the client has no session to satisfy the `profiles` RLS policy).
   *
   * Takes the SAME field set as SignupPage.jsx: the required
   * name/email/password plus the optional phone/gender/DOB/address. These
   * were previously hardcoded to blank defaults, which silently discarded
   * whatever the user typed into those fields.
   */
  const signup = useCallback(
    async ({
      name,
      email,
      password,
      phone = '',
      gender = '',
      dateOfBirth = '',
      street = '',
      city = '',
      state = '',
      pincode = '',
    }) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name.trim(),
            phone: phone.trim(),
            gender: gender || null,
            date_of_birth: dateOfBirth || null,
            address: {
              street: street.trim(),
              city: city.trim(),
              state: state.trim(),
              pincode: pincode.trim(),
            },
          },
        },
      });
      if (error) throw new Error(error.message || 'Signup failed');
    },
    []
  );

  /** Anti-enumeration: Supabase returns success regardless of whether the account exists. */
  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    if (error) throw new Error(getAuthErrorMessage(error));
  }, []);

  /** Call only while a recovery session is active (see reset-password.jsx). */
  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    // Sign out of the temporary recovery session so the user logs back in
    // with their new password through the normal flow.
    await supabase.auth.signOut();
  }, []);

  /**
   * Ported from MobileNav.jsx's `handleLogout`, which does three things this
   * previously skipped: releases `profiles.active_session_id` so the account
   * is no longer recorded as held by this device, and drops the locally
   * mirrored session id. Without those, the single-device-session watcher
   * (`useSessionWatcher`) compares a cleared local id against a still-set
   * profiles id on the NEXT login and can bounce the user straight back out.
   *
   * The `profiles` update has to happen while the session is still valid —
   * i.e. before `signOut()` — or RLS rejects it.
   */
  const logout = useCallback(async (uid) => {
    if (uid) {
      try {
        await supabase.from('profiles').update({ active_session_id: null }).eq('id', uid);
      } catch (e) {
        console.log('Could not clear active session:', e);
      }
    }
    await clearLocalSession().catch(() => {});
    try {
      await supabase.auth.signOut();
    } catch {
      /* already signed out */
    }
    dispatch(clearUser());
  }, [dispatch]);

  return { login, signup, requestPasswordReset, updatePassword, logout };
}