import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';

/**
 * Returns the literal colour values for the ACTIVE colour scheme.
 *
 * NativeWind `className`s handle almost all styling in this app, but a few
 * places genuinely need a raw hex/rgba string because the target takes a
 * `color`-style prop rather than `style`/`className`:
 *   - `@expo/vector-icons` glyphs (`color` prop)
 *   - `<TextInput placeholderTextColor>`
 *   - `<ActivityIndicator color>`
 *   - `<Slider minimumTrackTintColor>` / bottom-tab `tabBar*TintColor`
 *
 * Previously those spots hardcoded light-theme hex literals (e.g. the
 * `placeholderTextColor="#74777D"` repeated across screens, and the tab bar's
 * `Colors.light.*`), which meant they did not follow the app's dark mode.
 * Reading through this hook keeps them in step with `@/lib/colorScheme`.
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? Colors.dark : Colors.light;
}