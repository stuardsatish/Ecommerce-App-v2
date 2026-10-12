import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * RN equivalent of Ecommerce-sept-1-2026/src/components/Common/Skeleton.jsx's
 * `animate-pulse bg-surface-muted` block. NativeWind's runtime doesn't map
 * Tailwind's `animate-pulse` keyframe utility to a native animation driver
 * (confirmed by searching its compiled interop — no match), so the pulse is
 * implemented directly with Reanimated instead of relying on that className.
 */
export function Skeleton({ variant = 'rect', className = '' }) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const shape = variant === 'circular' ? 'rounded-full' : 'rounded';

  return <Animated.View className={`bg-surface-muted ${shape} ${className}`} style={style} />;
}