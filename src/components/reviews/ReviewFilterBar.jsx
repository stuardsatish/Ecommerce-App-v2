import { Pressable, ScrollView, Text } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

function Chip({ label, a11yLabel, star, selected, disabled, onPress }) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel || label}
      accessibilityState={{ selected, disabled: !!disabled }}
      className={`flex-row items-center gap-1 rounded-full border px-3.5 py-2 active:opacity-70 ${
        selected ? 'border-ink bg-ink' : 'border-border bg-surface'
      }`}
      style={{ opacity: disabled ? 0.4 : 1 }}>
      {star ? <Icon name="star-filled" size={11} color={selected ? c.inverse : c.chartGold} /> : null}
      <Text className={`font-sans-semibold text-xs ${selected ? 'text-inverse' : 'text-body'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Horizontally scrolling filter chips: All · 5★ … 1★ (with counts; a star
 * with no reviews is disabled) · With photos. The rating chips are a radio
 * group, "With photos" toggles independently. The photos chip only appears
 * once at least one review has a photo, so it isn't dead weight on products
 * (or deployments) without any.
 * @param {{ counts: Record<number,number>, photoCount: number, rating: number,
 *           onRating: (n:number) => void, withPhotos: boolean,
 *           onWithPhotos: (on:boolean) => void }} props
 */
export function ReviewFilterBar({ counts, photoCount, rating, onRating, withPhotos, onWithPhotos }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 pr-2"
      accessibilityLabel="Filter reviews">
      <Chip label="All" selected={rating === 0} onPress={() => onRating(0)} />
      {[5, 4, 3, 2, 1].map((star) => (
        <Chip
          key={star}
          star
          label={`${star} (${counts[star] || 0})`}
          a11yLabel={`${star} star reviews (${counts[star] || 0})`}
          selected={rating === star}
          disabled={!counts[star]}
          onPress={() => onRating(star)}
        />
      ))}
      {photoCount > 0 ? (
        <Chip
          label={`With photos (${photoCount})`}
          selected={withPhotos}
          onPress={() => onWithPhotos(!withPhotos)}
        />
      ) : null}
    </ScrollView>
  );
}