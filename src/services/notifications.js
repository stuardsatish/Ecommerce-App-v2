/**
 * Phase 7.2 — Expo push-notification service.
 *
 * Responsibilities:
 *   1. Request permission + obtain the Expo Push Token (EPT).
 *   2. Upsert the token into `public.device_tokens` so the
 *      `notifications-dispatch` Edge Function can find it.
 *   3. Expose helpers for reading in-app notifications from
 *      `public.notifications` (the in-app inbox).
 *   4. Expose helpers for managing `notification_preferences`.
 *
 * Design choices:
 *   - Graceful degradation: every exported function catches and
 *     swallows errors so a permissions denial or DB failure never
 *     crashes the app.
 *   - Physical device only: Expo push tokens only work on real
 *     devices, not the iOS/Android simulator. The helper returns
 *     null on simulators and Expo Go web.
 *   - The token is re-upserted each app launch (last_seen_at is
 *     always fresh), but the `token` column is UNIQUE so duplicate
 *     registrations are collapsed automatically.
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// ── Foreground notification behaviour ──────────────────────────────────────
// Show an alert + badge + sound even when the app is in the foreground (mobile only).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ── Token registration ─────────────────────────────────────────────────────

/**
 * Requests push-notification permission from the OS and obtains the
 * Expo Push Token. Returns `null` if the device can't receive push
 * notifications (web, simulator, denied permission, etc.).
 *
 * @returns {Promise<string|null>} The EPT string, or null.
 */
export async function getExpoPushToken() {
  try {
    // Push notifications via Expo Notifications are not supported on web.
    if (Platform.OS === 'web') return null;

    // Push tokens only work on physical devices.
    if (!Device.isDevice) return null;

    // Android needs a notification channel before it can deliver anything.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Check / request permission.
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // Obtain the EPT.
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data || null;
  } catch (err) {
    console.warn('[notifications] getExpoPushToken failed:', err?.message);
    return null;
  }
}

/**
 * Registers the device's Expo Push Token with Supabase.
 * Safe to call on every app launch — the token column is UNIQUE and
 * the upsert only updates `last_seen_at` + `app_version` if the row
 * already exists.
 *
 * @param {string} token The EPT returned by getExpoPushToken().
 * @returns {Promise<void>}
 */
export async function registerPushToken(token) {
  if (!token) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

    await supabase.from('device_tokens').upsert(
      {
        user_id: user.id,
        token,
        platform,
        device_name: Device.deviceName || null,
        app_version: '1.0.0',
        enabled: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token', ignoreDuplicates: false }
    );
  } catch (err) {
    console.warn('[notifications] registerPushToken failed:', err?.message);
  }
}

/**
 * Disables (soft-deletes) the token when the user signs out, so they
 * stop receiving notifications for the old session.
 *
 * @param {string} token
 */
export async function deregisterPushToken(token) {
  if (!token) return;
  try {
    await supabase
      .from('device_tokens')
      .update({ enabled: false })
      .eq('token', token);
  } catch (err) {
    console.warn('[notifications] deregisterPushToken failed:', err?.message);
  }
}

// ── In-app notification inbox ──────────────────────────────────────────────

/**
 * Fetches the most recent in-app notifications for the current user.
 *
 * @param {{ limit?: number }} options
 * @returns {Promise<Array<{id, type, title, body, data, is_read, created_at}>>}
 */
export async function listNotifications({ limit = 30 } = {}) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[notifications] listNotifications failed:', err?.message);
    return [];
  }
}

/**
 * Marks a single notification as read.
 *
 * @param {string} notificationId
 */
export async function markNotificationRead(notificationId) {
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  } catch (err) {
    console.warn('[notifications] markNotificationRead failed:', err?.message);
  }
}

/**
 * Marks all unread notifications for the current user as read.
 */
export async function markAllNotificationsRead() {
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);
  } catch (err) {
    console.warn('[notifications] markAllNotificationsRead failed:', err?.message);
  }
}

// ── Notification preferences ───────────────────────────────────────────────

/**
 * Fetches the current user's notification preferences.
 * Returns defaults (all true) if the row doesn't exist yet.
 *
 * @returns {Promise<{order_updates, back_in_stock, price_drops, promotions}>}
 */
export async function getNotificationPreferences() {
  const defaults = {
    order_updates: true,
    back_in_stock: true,
    price_drops: true,
    promotions: false,
  };
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('order_updates, back_in_stock, price_drops, promotions')
      .single();
    if (error || !data) return defaults;
    return { ...defaults, ...data };
  } catch {
    return defaults;
  }
}

/**
 * Saves notification preferences for the current user (upserts).
 *
 * @param {{ order_updates?: boolean, back_in_stock?: boolean, price_drops?: boolean, promotions?: boolean }} prefs
 */
export async function saveNotificationPreferences(prefs) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notification_preferences').upsert(
      { user_id: user.id, ...prefs },
      { onConflict: 'user_id' }
    );
  } catch (err) {
    console.warn('[notifications] saveNotificationPreferences failed:', err?.message);
  }
}

// ── Stock alerts ───────────────────────────────────────────────────────────

/**
 * Adds a "notify me when back in stock" alert for a product.
 * Matches the existing `stock_alerts` table (from Phase 7.4 migration).
 *
 * @param {string} productId
 * @param {string|null} variantId
 */
export async function addStockAlert(productId, variantId = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Login required');
    const { error } = await supabase.from('stock_alerts').upsert(
      {
        user_id: user.id,
        product_id: productId,
        variant_id: variantId,
      },
      { onConflict: 'user_id,product_id,variant_id', ignoreDuplicates: true }
    );
    if (error) throw error;
  } catch (err) {
    console.warn('[notifications] addStockAlert failed:', err?.message);
    throw err;
  }
}

/**
 * Removes a stock alert for a product (if the user no longer wants it).
 *
 * @param {string} productId
 * @param {string|null} variantId
 */
export async function removeStockAlert(productId, variantId = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let q = supabase
      .from('stock_alerts')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId);
    if (variantId) {
      q = q.eq('variant_id', variantId);
    } else {
      q = q.is('variant_id', null);
    }
    await q;
  } catch (err) {
    console.warn('[notifications] removeStockAlert failed:', err?.message);
  }
}

/**
 * Checks whether the current user has a stock alert for a given product.
 *
 * @param {string} productId
 * @param {string|null} variantId
 * @returns {Promise<boolean>}
 */
export async function hasStockAlert(productId, variantId = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    let q = supabase
      .from('stock_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('product_id', productId);
    if (variantId) {
      q = q.eq('variant_id', variantId);
    } else {
      q = q.is('variant_id', null);
    }
    const { count } = await q;
    return (count || 0) > 0;
  } catch {
    return false;
  }
}
