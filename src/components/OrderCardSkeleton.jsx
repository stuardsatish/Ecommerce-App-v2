import { View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';

/**
 * Ported from OrderCardSkeleton.jsx (the source's own mobile-only skeleton —
 * desktop order lists use their own inline skeleton, not ported per the
 * mobile-only scope of this migration).
 */
export function OrderCardSkeleton() {
  return (
    <View className="rounded-xl bg-surface p-4 shadow-card">
      <View className="mb-3 flex-row items-center justify-between gap-2 border-b border-surface-muted pb-3">
        <View className="gap-1.5">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-3.5 w-24" />
        </View>
        <View className="flex-row items-center gap-2.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </View>
      </View>

      <View className="gap-2.5">
        {[0, 1].map((i) => (
          <View key={i} className="flex-row items-center gap-2.5">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <View className="flex-1 gap-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-2.5 w-1/4" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}