// Ported from Ecommerce-sept-1-2026/src/utils/sessionManager.js — single-
// device-session enforcement. Source of truth is still `profiles.active_session_id`;
// only the local-storage mechanism changed (AsyncStorage instead of
// localStorage, so these become async), plus RN-appropriate device-info and
// navigation calls replacing `navigator.userAgent` / `window.location.href`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';

export const SESSION_KEY = 'app_session_id';

/** Random unique session id. */
export const generateSessionId = () => Crypto.randomUUID();

// Brief window after a login during which the session watcher ignores
// local/profiles id mismatches — they're expected while the new id propagates,
// and acting on them would log the user out of the very session they just opened.
let _graceUntil = 0;
export const beginSessionGrace = (ms = 10000) => {
  _graceUntil = Date.now() + ms;
};
export const inSessionGrace = () => Date.now() < _graceUntil;

/**
 * Register a new session for this device on login. Overwrites any session held
 * by other devices for the same account, then mirrors the id into AsyncStorage.
 * @param {string} uid
 * @returns {Promise<string>} the new session id
 */
export const registerNewSession = async (uid) => {
  const sessionId = generateSessionId();

  // Suppress the watcher while local + profiles settle to the new id.
  beginSessionGrace();

  // Mirror locally, then write the id to the profiles row IMMEDIATELY (no
  // slow calls in between) so the two stay in sync within the grace window.
  await AsyncStorage.setItem(SESSION_KEY, sessionId);
  const deviceInfo = `${Device.modelName || 'unknown device'} · ${Device.osName || ''} ${Device.osVersion || ''}`.trim().substring(0, 150);

  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        active_session_id: sessionId,
        last_login_at: new Date().toISOString(),
        last_login_device: deviceInfo,
      })
      .eq('id', uid);
    if (error) console.log('registerNewSession: failed to write session:', error);
  } catch (e) {
    console.log('registerNewSession: failed to write session:', e);
  }

  // IP is optional — fetch + store in the background; never block or fail login.
  fetch('https://api.ipify.org?format=json')
    .then((r) => r.json())
    .then((d) => d?.ip && supabase.from('profiles').update({ last_login_ip: d.ip }).eq('id', uid))
    .catch(() => {});

  return sessionId;
};

/** Remove this device's stored session id. */
export const clearLocalSession = () => AsyncStorage.removeItem(SESSION_KEY);

/** This device's stored session id (or null). */
export const getLocalSessionId = () => AsyncStorage.getItem(SESSION_KEY);

/**
 * Force this device to log out and bounce to /login with a reason.
 * @param {"session_conflict"|"no_session"|string} reason
 */
export const forceLogout = async (reason = 'session_conflict') => {
  await clearLocalSession();
  try {
    // scope: 'local' — this call runs on the STALE device detecting a newer
    // login elsewhere. The default (global) scope revokes every session for
    // the user, including the new one that's supposed to remain active,
    // which defeats single-session enforcement entirely.
    await supabase.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.log('Sign out error:', e);
  }
  router.replace({ pathname: '/login', params: { reason } });
};