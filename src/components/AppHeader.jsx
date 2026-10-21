import { router } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColors } from '@/hooks/useThemeColors';
import { pinColorScheme } from '@/lib/colorScheme';

/**
 * Global mobile header — back button, page title, three-dot menu. Ported from
 * MobileNav.jsx's `<header>` (its bottom tab bar is superseded by this app's
 * own Expo Router tab bar, see `(tabs)/_layout.jsx`).
 *
 * The chevron/kebab/close glyphs are real icons here rather than the `‹` and
 * `⋮` text characters this used before, and the menu now carries MobileNav's
 * full non-admin item list. `Process` and `Contact` are the only two source
 * items left out: both point at routes that don't exist in this app (the web
 * `/contact` link 404s even on web, and `/process-details` is GSAP marketing
 * content excluded by the resolved "no Landing/marketing screens" decision).
 *
 * `Dark Mode` is this app's own addition (the source only auto-follows the
 * OS); `pinColorScheme` persists the pin. See @/lib/colorScheme.js.
 */
export function AppHeader({ title }) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { logout } = useAuth();
  const user = useSelector((state) => state.user.user);
  const { colorScheme } = useColorScheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const isDark = colorScheme === 'dark';

  const goBack = () => {
    if (router.canGoBack()) router.back();
  };

  const go = (path) => {
    setMenuOpen(false);
    router.push(path);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout(user?.uid);
    router.replace('/login');
  };

  // MobileNav's non-admin `menuItems`, minus the two dead marketing routes.
  // "Edit Profile" duplicating "My Profile" is faithful to the source — both
  // entries there navigate to `/myprofile`.
  //
  // "Help Center" is this app's own addition (roadmap task 1.14): the web app
  // reaches its help/policy pages through the Footer, which this app has no
  // equivalent of, so the kebab menu is the one always-reachable surface for
  // them. "My Returns" mirrors the entry the website's MobileNav got with the returns / exchanges feature (Phase 6).
  const menuItems = [
    { label: 'My Profile', path: '/profile' },
    { label: 'My Addresses', path: '/addresses' },
    { label: 'Current Orders', path: '/orders?tab=ONGOING' },
    { label: 'Past Orders', path: '/orders?tab=PAST' },
    { label: 'My Returns', path: '/returns' },
    { label: 'Edit Profile', path: '/profile' },
    { label: 'Help Center', path: '/support/faq' },
  ];

  return (
    <>
      <View
        className="h-14 flex-row items-center justify-between px-1"
        style={{
          backgroundColor: c.background,
          // MobileNav: `0px 2px 12px -6px rgba(16,24,40,0.14)`.
          shadowColor: '#101828',
          shadowOpacity: 0.14,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}>
        <Pressable
          onPress={goBack}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center active:opacity-60">
          <Icon name="chevron-left" size={24} color={c.body} />
        </Pressable>

        <Text
          accessibilityRole="header"
          className="mx-2 flex-1 text-center font-sans-bold text-[15px] uppercase tracking-wide text-ink"
          numberOfLines={1}>
          {title}
        </Text>

        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center active:opacity-60">
          <Icon name="more-vertical" size={22} color={c.body} />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}>
        <Pressable className="flex-1" onPress={() => setMenuOpen(false)}>
          <View
            className="absolute right-3 w-56 overflow-hidden rounded-xl border border-border bg-surface"
            style={{
              top: insets.top + 56,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 25,
              shadowOffset: { width: 0, height: 10 },
              elevation: 8,
            }}>
            <View className="border-b border-border px-4 py-3">
              <Text className="font-sans text-[10px] uppercase tracking-widest text-muted">
                {user ? 'Signed in as' : 'Welcome'}
              </Text>
              <Text className="font-sans-bold text-sm text-ink" numberOfLines={1}>
                {user ? user.name || 'User' : 'Guest'}
              </Text>
            </View>

            {user ? (
              <>
                {menuItems.map((item, i) => (
                  <Pressable
                    key={`${item.path}-${i}`}
                    onPress={() => go(item.path)}
                    accessibilityRole="menuitem"
                    className="px-4 py-3 active:bg-surface-muted">
                    <Text className="font-sans text-sm text-ink">{item.label}</Text>
                  </Pressable>
                ))}

                <Pressable
                  onPress={() => pinColorScheme(isDark ? 'light' : 'dark')}
                  accessibilityRole="menuitem"
                  className="flex-row items-center justify-between border-t border-border px-4 py-3 active:bg-surface-muted">
                  <View className="flex-row items-center gap-2">
                    <Icon name={isDark ? 'moon' : 'sun'} size={14} color={c.body} />
                    <Text className="font-sans text-sm text-ink">Dark Mode</Text>
                  </View>
                  <Text className="font-sans-semibold text-sm text-primary">
                    {isDark ? 'On' : 'Off'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleLogout}
                  accessibilityRole="menuitem"
                  className="flex-row items-center gap-2 border-t border-border px-4 py-3 active:bg-error-subtle">
                  <Icon name="log-out" size={14} color={c.error} />
                  <Text className="font-sans-semibold text-sm text-error">Logout</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => go('/login')}
                accessibilityRole="menuitem"
                className="px-4 py-3 active:bg-surface-muted">
                <Text className="font-sans text-sm text-ink">Login</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}