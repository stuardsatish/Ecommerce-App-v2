import { Tabs } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { Icon } from '@/components/Icon';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Bottom tab bar — ported from MobileNav.jsx's `<nav>` (its user-role `tabs`
 * array, minus the Home tab, per the resolved "no Landing screen" decision).
 *
 * Previously this layout had no icons at all, hardcoded `Colors.light.*` (so
 * it stayed light in dark mode), and no cart indicator. All three are fixed
 * here against the source:
 *   - Icons: Store / ShoppingCart / Heart / User at size 22, `strokeWidth`
 *     2.4 when active in the source — RN icon fonts have a fixed stroke, so
 *     the active state is carried by colour alone (primary vs. body).
 *   - The cart tab's dot badge (`dot: cartCount > 0`) and its 600 ms
 *     "bounce" when the count goes up, both from MobileNav.
 *   - Surface/label colours follow the active colour scheme.
 */
const TABS = [
  { name: 'products', title: 'Products', icon: 'store' },
  { name: 'cart', title: 'Cart', icon: 'shopping-cart' },
  { name: 'wishlist', title: 'Wishlist', icon: 'heart' },
  { name: 'notifications', title: 'Alerts', icon: 'bell' },
  { name: 'profile', title: 'Profile', icon: 'user' },
];

function CartDot({ bounced, color }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: -3,
        right: -4,
        width: bounced ? 12 : 8,
        height: bounced ? 12 : 8,
        borderRadius: 9999,
        backgroundColor: color,
      }}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  const cartItems = useSelector((state) => state.cart.cartItems);
  const cartCount = cartItems.reduce((acc, i) => acc + (i.quantity || 0), 0);

  // Phase 7.2 — notification unread count for the bell badge.
  const { unreadCount: notifCount } = usePushNotifications();

  // Ported from MobileNav's `cartBounced` effect — pulse the dot for 600 ms
  // whenever the total cart quantity increases.
  const [cartBounced, setCartBounced] = useState(false);
  const prevCartCountRef = useRef(cartCount);
  useEffect(() => {
    if (cartCount > prevCartCountRef.current) {
      setCartBounced(true);
      const t = setTimeout(() => setCartBounced(false), 600);
      prevCartCountRef.current = cartCount;
      return () => clearTimeout(t);
    }
    prevCartCountRef.current = cartCount;
  }, [cartCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.body,
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Inter_500Medium' },
        tabBarStyle: {
          backgroundColor: c.background,
          borderTopWidth: 0,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingTop: 10,
          height: 56 + insets.bottom,
          // Matches MobileNav's `0px -8px 24px -6px rgba(0,0,0,0.10)`.
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -8 },
          elevation: 12,
        },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => (
              <View className="items-center justify-center">
                <Icon name={tab.icon} size={22} color={color} />
                {tab.name === 'cart' && cartCount > 0 ? (
                  <CartDot bounced={cartBounced} color={c.primary} />
                ) : null}
                {tab.name === 'notifications' && notifCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -6,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: c.error || '#ef4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 3,
                    }}>
                    {/* Text import comes from react-native already pulled into this file's scope via View */}
                  </View>
                ) : null}
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}