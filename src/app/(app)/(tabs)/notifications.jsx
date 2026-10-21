import { router } from 'expo-router';
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
import { notificationIconKey, notificationRoute, timeAgo, unreadCount as countUnread } from '@/utils/notificationModel';

/** The model's neutral icon key -> a name <Icon> knows (an unknown name renders nothing). */
const ICONS = {
  order: 'package',
  return: 'rotate-ccw',
  exchange: 'rotate-ccw',
  refund: 'credit-card',
  stock: 'check-circle-2',
  price: 'tag',
  promo: 'gift',
  admin: 'info',
  alert: 'alert-triangle',
  bell: 'bell',
};

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

  /** Opens the notification: marks it read and, when it points somewhere (the order, My Returns, the product), goes there. */
  const handleOpen = async (item) => {
    if (!item.read) {
      await markNotificationRead(item.id);
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    }
    const target = notificationRoute(item, 'app');
    if (target) router.push(target);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = countUnread(notifications);

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
            <Icon name="clock" size={28} color={c.muted} />
            <Text className="text-sm text-muted">Loading…</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Icon name="bell" size={48} color={c.borderStrong} />
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
                onPress={() => handleOpen(item)}
                accessibilityRole="button"
                className="active:opacity-70"
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                  backgroundColor: item.read ? 'transparent' : `${c.primary}10`,
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
                  <Icon name={ICONS[notificationIconKey(item)] || 'bell'} size={18} color={c.primary} />
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
                      {timeAgo(item.createdAt)}
                    </Text>
                  </View>
                  {item.body ? (
                    <Text className="mt-0.5 text-[13px] text-body leading-[18px]" numberOfLines={3}>
                      {item.body}
                    </Text>
                  ) : null}
                </View>

                {/* Unread dot */}
                {!item.read ? (
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