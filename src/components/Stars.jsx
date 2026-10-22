import { Pressable, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Five-star rating row. Replaces the `'★'.repeat(n) + '☆'.repeat(5 - n)`
 * string approach the RN screens used before, which rendered at the system
 * font's star glyph (inconsistent metrics across iOS/Android, and no way to
 * match the source's size/colour).
 *
 * The source renders five separate `<Star>` elements and fills the ones below
 * the rating, colouring them `--color-chart-gold` and the rest
 * `--color-border-strong` (ProductDetail's rating row and per-review stars,
 * FiltersSidebar's rating filter, both order pages' review stars). This
 * mirrors that exactly, including the `Math.round` the source applies to
 * fractional averages.
 */
export function Stars({ rating = 0, size = 12, gap = 2, round = true }) {
  const c = useThemeColors();
  const filled = round ? Math.round(Number(rating) || 0) : Math.floor(Number(rating) || 0);

  return (
    <View className="flex-row items-center" style={{ gap }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon
          key={i}
          name="star-filled"
          size={size}
          color={i < filled ? c.chartGold : c.borderStrong}
        />
      ))}
    </View>
  );
}

/**
 * Tappable variant for the review sheet. The source also previews a rating on
 * `onMouseEnter`/`onMouseLeave` (`hoverRating`), which has no touch analogue —
 * tapping sets the rating directly, which is what a touch on web does anyway.
 */
export function StarPicker({ value = 0, onChange, size = 30, gap = 8 }) {
  const c = useThemeColors();

  return (
    <View className="flex-row" style={{ gap }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
          className="active:opacity-60">
          <Icon
            name={value >= star ? 'star-filled' : 'star'}
            size={size}
            color={value >= star ? c.chartGold : c.borderStrong}
          />
        </Pressable>
      ))}
    </View>
  );
}