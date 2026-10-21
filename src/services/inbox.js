// The customer's in-app inbox (public.notifications) and the device-token registration, written against the database as it REALLY is
// (migration 20261008_04_notifications.sql):
//   * the columns are kind / read_at - NOT type / is_read (the first version of this app asked for columns that do not exist, so the inbox came
//     back empty for everyone);
//   * a customer may only flip read_at, and only through mark_notifications_read() (every other write on the table is revoked);
//   * device tokens are written through register_device_token() / unregister_device_token() - direct inserts / updates on device_tokens are revoked,
//     so the first version of this app never stored a push token.
// The Supabase client is INJECTED (createInboxService(client)) so a fake stands in under Jest; src/services/notifications.js wires the real one and
// keeps the push-permission code, which needs native modules and therefore cannot be unit-tested.
import { supabase } from '@/lib/supabase';
import { NOTIFICATION_COLUMNS, mapNotificationRows } from '@/utils/notificationModel';

export function createInboxService(client) {
  return {
    /** the newest notifications of the signed-in customer, mapped (see utils/notificationModel.js); RLS limits the rows to their own */
    async list({ limit = 30 } = {}) {
      const { data, error } = await client
        .from('notifications')
        .select(NOTIFICATION_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return mapNotificationRows(data);
    },

    /** marks the given notifications read (an array of ids) - or every unread one when ids is null / omitted. Returns how many changed. */
    async markRead(ids = null) {
      const { data, error } = await client.rpc('mark_notifications_read', { p_ids: Array.isArray(ids) ? ids : null });
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },

    /** stores / refreshes this phone's push token for the signed-in customer (a token moves to whoever signs in last on the phone) */
    async registerToken({ token, platform, deviceName = null, appVersion = null }) {
      const { error } = await client.rpc('register_device_token', {
        p_token: token,
        p_platform: platform,
        p_device_name: deviceName,
        p_app_version: appVersion,
      });
      if (error) throw error;
    },

    /** forgets this phone's token for the signed-in customer (sign-out) */
    async unregisterToken(token) {
      const { error } = await client.rpc('unregister_device_token', { p_token: token });
      if (error) throw error;
    },
  };
}

export const inboxService = createInboxService(supabase);