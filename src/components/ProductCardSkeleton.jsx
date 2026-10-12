import { View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';

/**
 * Shaped to match this app's ProductCard (mobile grid layout), not the
 * source web app's own `ProductCardSkeleton` — that one is built around a
 * fixed `h-[340px]` card with a `max-w-[120px]` centred image, which is the
 * DESKTOP card's proportions being reused inside the mobile `grid-cols-2`
 * (source ProductsPage line 870). RN has one card shape, so this tracks the
 * real `ProductCard` instead, block for block:
 *
 *   wishlist circle → image square → category / title×2 / rating row →
 *   price + stock pair → action button
 *
 * The rating row and the stock label beside the price were missing here
 * before; without them the placeholder was two rows shorter than the card it
 * stands in for, so the grid shifted when real data landed — the one thing a
 * content-aware skeleton exists to avoid.
 */
export function ProductCardSkeleton() {
  return (
    <View
      className="relative w-full overflow-hidden rounded-xl bg-surface shadow-card"
      style={{ minHeight: 347 }}>
      <View className="absolute right-3 top-3 z-20">
        <Skeleton variant="circular" className="h-8 w-8" />
      </View>

      <View className="w-full bg-surface-muted p-2">
        <Skeleton className="aspect-square w-full rounded-lg" />
      </View>

      <View className="flex-1 p-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-1 h-4 w-full" />
        <Skeleton className="mt-1 h-4 w-2/3" />
        {/* Rating row: 11px star + "4.5 (12)". */}
        <Skeleton className="mt-1.5 h-3 w-24" />

        <View className="mt-auto">
          <View className="mb-2 mt-2.5 flex-row items-center justify-between">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-14" />
          </View>
          <Skeleton className="h-9 w-full rounded-full" />
        </View>
      </View>
    </View>
  );
}