/**
 * Phase 7.2 — usePushNotifications hook.
 *
 * Call once from the root _layout (or anywhere that mounts early and
 * persists for the app's lifetime). On mount it:
 *   1. Requests Expo push-notification permission.
 *   2. Retrieves the Expo Push Token.
 *   3. Persists the token to `device_tokens` via Supabase.
 *   4. Adds a foreground notification listener so tapping a notification
 *      while the app is open routes to the right screen.
 *   5. Handles notifications received while the app is backgrounded
 *      (last notification response).
 *
 * Returns `{ token, unreadCount }` so the tab bar can show a badge.
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';

import {
  deregisterPushToken,
  getExpoPushToken,
  listNotifications,
  markNotificationRead,
  registerPushToken,
} from '@/services/notifications';
import { routeForPushData, unreadCount as countUnread } from '@/utils/notificationModel';

/**
 * Routes the user to the right screen based on the notification's data.type
 * (the order, the product, My Returns ...; the inbox when it has no destination).
 * Called when the user taps a notification (foreground or background).
 *
 * @param {object} notification
 */
function handleNotificationNavigation(notification) {
  const data = notification?.request?.content?.data || {};
  try {
    // the dispatcher puts the row's id into the push data: tapping it counts as reading it
    if (data.notificationId) markNotificationRead(data.notificationId);
    router.push(routeForPushData(data));
  } catch {
    // If routing fails (e.g. app not fully mounted), ignore.
  }
}

/**
 * @returns {{ token: string|null, unreadCount: number }}
 */
export function usePushNotifications() {
  const user = useSelector((state) => state.user.user);
  const [token, setToken] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const tokenRef = useRef(null); // keep for deregistration on sign-out

  // ── Register / deregister on auth change ─────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;

    if (!user?.uid) {
      // User signed out — deregister the old token.
      if (tokenRef.current) {
        deregisterPushToken(tokenRef.current);
        tokenRef.current = null;
        setToken(null);
      }
      return;
    }

    let active = true;

    (async () => {
      const expoPushToken = await getExpoPushToken();
      if (!active) return;
      if (expoPushToken) {
        await registerPushToken(expoPushToken);
        tokenRef.current = expoPushToken;
        setToken(expoPushToken);
      }
    })();

    return () => { active = false; };
  }, [user?.uid]);

  // ── Unread count — refresh on mount and every 60 s ───────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    let mounted = true;

    const refresh = async () => {
      const notifications = await listNotifications({ limit: 50 });
      if (mounted) {
        setUnreadCount(countUnread(notifications));
      }
    };

    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [user?.uid]);

  // ── Foreground notification listener ─────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationReceivedListener(() => {
      // Refresh unread count when a new notification arrives in the foreground.
      if (user?.uid) {
        listNotifications({ limit: 50 }).then((list) => {
          setUnreadCount(countUnread(list));
        });
      }
    });
    return () => subscription?.remove?.();
  }, [user?.uid]);

  // ── Background / killed → foreground: handle last response ───────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Fires when the user taps a notification that brought the app to the
    // foreground from background/killed state.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => handleNotificationNavigation(response?.notification)
    );

    // If the app was opened via a notification tap (killed state), handle it.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleNotificationNavigation(response?.notification);
      })
      .catch((err) => {
        console.warn('[notifications] getLastNotificationResponseAsync unavailable:', err?.message);
      });

    return () => subscription?.remove?.();
  }, []);

  return { token, unreadCount };
}