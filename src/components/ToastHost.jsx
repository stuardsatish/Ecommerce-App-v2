import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { subscribeToToasts } from '@/lib/toast';

const AUTO_CLOSE_MS = 3000;

/**
 * Renders whatever `@/lib/toast` emits. Mounted once, at the root layout.
 *
 * The entrance/exit mirrors MyProfile.jsx's GSAP toast exactly — in from
 * `{ y: 24, opacity: 0 }` over 400 ms, held for 3 s (react-toastify's
 * `autoClose={3000}`), then back out to `{ y: 24, opacity: 0 }`.
 *
 * Toasts are shown one at a time; a new one replaces whatever is on screen
 * (react-toastify stacks, but stacking pills over a phone-width tab bar is
 * worse than replacing, and the app never fires two at once in practice).
 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const [current, setCurrent] = useState(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const hideTimer = useRef(null);

  useEffect(
    () =>
      subscribeToToasts((entry) => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setCurrent(entry);

        opacity.value = withTiming(1, { duration: 400 });
        translateY.value = withTiming(0, { duration: 400 });

        hideTimer.current = setTimeout(() => {
          opacity.value = withTiming(0, { duration: 400 });
          translateY.value = withTiming(24, { duration: 400 });
          // Unmount only after the exit animation has finished, so the pill
          // doesn't vanish mid-fade.
          hideTimer.current = setTimeout(() => setCurrent(null), 400);
        }, AUTO_CLOSE_MS);
      }),
    [opacity, translateY]
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!current) return null;

  const iconName =
    current.type === 'error'
      ? 'alert-triangle'
      : current.type === 'info'
        ? 'info'
        : 'check-circle-2';
  const iconColor =
    current.type === 'error' ? c.errorBorder : current.type === 'info' ? c.infoBorder : c.successBorder;

  return (
    // `pointerEvents: none` so a toast sitting over the bottom action bar can
    // never swallow a tap meant for Place Order / Add to Cart.
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + 92,
        alignItems: 'center',
        paddingHorizontal: 20,
        zIndex: 999,
      }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        className="max-w-full flex-row items-center gap-2 rounded-xl px-5 py-3"
        style={[
          animatedStyle,
          {
            backgroundColor: c.ink,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 10 },
            elevation: 8,
          },
        ]}>
        <Icon name={iconName} size={16} color={iconColor} />
        <Text className="font-sans-semibold text-sm" style={{ color: c.inverse }}>
          {current.message}
        </Text>
      </Animated.View>
    </View>
  );
}