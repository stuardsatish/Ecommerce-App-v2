import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/Skeleton';

/**
 * Shaped to match this screen's mobile layout (hero image + thumbnail strip +
 * info block), not the source web app's desktop-sized skeleton grid — RN only
 * has the one form factor. See ProductDetailSkeleton.jsx in the source app
 * for the desktop version this intentionally doesn't mirror.
 */
export function ProductDetailSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1">
        <View className="gap-4 px-5 pt-4">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <View className="flex-row gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-20 rounded-lg" />
            ))}
          </View>

          <View className="gap-2 pt-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-3 w-32" />
          </View>

          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </View>
      </SafeAreaView>
    </View>
  );
}