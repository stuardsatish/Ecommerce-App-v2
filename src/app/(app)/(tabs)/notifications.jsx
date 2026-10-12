import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { AppHeader } from '@/components/AppHeader';
import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications';

/** Friendly icon name per notification type. */
function notifIcon(type) {
  switch (type) {
    case 'order_update': return 'package';
    case 'back_in_stock': return 'check-circle';
    case 'price_drop': return 'tag';
    case 'promotion': return 'gift';
    default: return 'bell';
  }
}

/** Relative time label, e.g. "2 hours ago". */
function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsScreen() {
  const c = useThemeColors();
  const user = useSelector((state) => state.user.user);

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await listNotifications({ limit: 50 });
    setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.uid) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleMarkRead = async (item) => {
    if (item.is_read) return;
    await markNotificationRead(item.id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
    );
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <AppHeader
          title="Notifications"
          right={
            unreadCount > 0 ? (
              <Pressable onPress={handleMarkAllRead} className="px-1 active:opacity-60">
                <Text className="font-sans-semibold text-sm text-primary">Mark all read</Text>
              </Pressable>
            ) : null
          }
        />

        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <Icon name="loader" size={28} color={c.muted} />
            <Text className="text-sm text-muted">Loading…</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Icon name="bell-off" size={48} color={c.borderStrong} />
            <Text className="font-sans-semibold text-sm text-muted text-center">
              No notifications yet.{'\n'}We'll let you know about orders, deals, and more.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerClassName="pb-4"
            refreshing={loading}
            onRefresh={load}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleMarkRead(item)}
                className="active:opacity-70"
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                  backgroundColor: item.is_read ? 'transparent' : `${c.primary}10`,
                }}>
                {/* Icon badge */}
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: `${c.primary}18`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                  <Icon name={notifIcon(item.type)} size={18} color={c.primary} />
                </View>

                {/* Content */}
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <View className="flex-row items-center justify-between gap-2">
                    <Text
                      className="font-sans-bold text-sm text-ink"
                      numberOfLines={1}
                      style={{ flex: 1 }}>
                      {item.title || 'Notification'}
                    </Text>
                    <Text className="text-[11px] text-muted" style={{ flexShrink: 0 }}>
                      {timeAgo(item.created_at)}
                    </Text>
                  </View>
                  {item.body ? (
                    <Text className="mt-0.5 text-[13px] text-body leading-[18px]" numberOfLines={3}>
                      {item.body}
                    </Text>
                  ) : null}
                </View>

                {/* Unread dot */}
                {!item.is_read ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: c.primary,
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                ) : null}
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
