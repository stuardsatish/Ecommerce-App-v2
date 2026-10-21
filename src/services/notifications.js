/**
 * Phase 7.2 — Expo push-notification service.
 *
 * Responsibilities:
 *   1. Request permission + obtain the Expo Push Token (EPT).
 *   2. Register the token (register_device_token RPC -> `public.device_tokens`)
 *      so the `notifications-dispatch` Edge Function can find it.
 *   3. Expose helpers for reading in-app notifications from
 *      `public.notifications` (the in-app inbox; see services/inbox.js).
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
import { inboxService } from '@/services/inbox';
import { rememberPushToken } from '@/services/pushToken';

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
 * Safe to call on every app launch — register_device_token() upserts on the
 * UNIQUE token (refreshing last_seen_at / app_version), and a token moves to
 * whoever signs in last on the phone.
 *
 * Goes through the RPC because direct inserts / updates on `device_tokens` are
 * revoked from the app roles (migration 20261008_04): the previous direct upsert
 * was silently refused, so no token was ever stored (known issue K-7 / P-11).
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

    await inboxService.registerToken({
      token,
      platform,
      deviceName: Device.deviceName || null,
      appVersion: '1.0.0',
    });
    rememberPushToken(token); // so logout can unregister it while the session is still valid (hooks/useAuth.js)
  } catch (err) {
    console.warn('[notifications] registerPushToken failed:', err?.message);
  }
}

/**
 * Forgets the token when the user signs out, so they stop receiving
 * notifications for the old session (unregister_device_token() deletes the row,
 * and only if it belongs to the signed-in user).
 *
 * @param {string} token
 */
export async function deregisterPushToken(token) {
  if (!token) return;
  try {
    await inboxService.unregisterToken(token);
  } catch (err) {
    console.warn('[notifications] deregisterPushToken failed:', err?.message);
  }
}

// ── In-app notification inbox ──────────────────────────────────────────────

/**
 * Fetches the most recent in-app notifications for the current user.
 * The table's columns are kind / read_at (the first version asked for type / is_read, which do not exist, so
 * the inbox was always empty - known issue K-7 / P-11); rows come back mapped by utils/notificationModel.js.
 *
 * @param {{ limit?: number }} options
 * @returns {Promise<Array<{id, kind, title, body, data, type, createdAt, readAt, read}>>}
 */
export async function listNotifications({ limit = 30 } = {}) {
  try {
    return await inboxService.list({ limit });
  } catch (err) {
    console.warn('[notifications] listNotifications failed:', err?.message);
    return [];
  }
}

/**
 * Marks a single notification as read (mark_notifications_read() - the only write a customer may make on the table).
 *
 * @param {string} notificationId
 */
export async function markNotificationRead(notificationId) {
  try {
    await inboxService.markRead([notificationId]);
  } catch (err) {
    console.warn('[notifications] markNotificationRead failed:', err?.message);
  }
}

/**
 * Marks all unread notifications for the current user as read.
 */
export async function markAllNotificationsRead() {
  try {
    await inboxService.markRead(null);
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
 * stock_alerts.variant_id is NOT NULL DEFAULT '' (migration 20261014_01): '' = the main (or only) option,
 * so a missing variant is always normalised to '' — never NULL, which would violate the constraint.
 *
 * @param {string} productId
 * @param {string|null} [variantId] '' / null / undefined = main option
 */
export async function addStockAlert(productId, variantId = '') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Login required');
    const { error } = await supabase.from('stock_alerts').upsert(
      {
        user_id: user.id,
        product_id: productId,
        variant_id: variantId || '',
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
 * @param {string|null} [variantId] '' / null / undefined = main option
 */
export async function removeStockAlert(productId, variantId = '') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('stock_alerts')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .eq('variant_id', variantId || '');
  } catch (err) {
    console.warn('[notifications] removeStockAlert failed:', err?.message);
  }
}

/**
 * Checks whether the current user has a stock alert for a given product.
 *
 * @param {string} productId
 * @param {string|null} [variantId] '' / null / undefined = main option
 * @returns {Promise<boolean>}
 */
export async function hasStockAlert(productId, variantId = '') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { count } = await supabase
      .from('stock_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .eq('variant_id', variantId || '');
    return (count || 0) > 0;
  } catch {
    return false;
  }
}