import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatAddressLine, formatPhone } from '@/services/addresses';

/**
 * One saved address on the address-book screen: label chip, "Default" badge,
 * recipient, the postal address, and Edit / Delete / Set-as-default actions
 * ("Set as default" is hidden on the default itself). `busy` greys the card
 * out while one of its actions is in flight, so a second tap can't race it.
 */
export function AddressCard({ address, busy = false, onEdit, onDelete, onSetDefault }) {
  const c = useThemeColors();

  return (
    <View
      className="gap-2.5 rounded-2xl border border-border bg-surface p-4"
      style={{ opacity: busy ? 0.55 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
      <View className="flex-row items-center gap-2">
        <View className="flex-row items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1">
          <Icon name="map-pin" size={12} color={c.body} />
          <Text className="font-sans-semibold text-[11px] text-body">{address.label}</Text>
        </View>
        {address.isDefault ? (
          <View className="rounded-full bg-success-subtle px-2.5 py-1">
            <Text className="font-sans-semibold text-[11px] text-primary">Default</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-0.5">
        <Text className="font-sans-semibold text-sm text-ink">{address.fullName || '—'}</Text>
        {address.phone ? <Text className="text-xs text-muted">{formatPhone(address.phone)}</Text> : null}
      </View>

      <View className="gap-0.5">
        <Text className="text-[13px] leading-5 text-body">{formatAddressLine(address)}</Text>
        {address.landmark ? (
          <Text className="text-xs text-muted">Landmark: {address.landmark}</Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-5 border-t border-border pt-3">
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${address.label} address`}
          hitSlop={8}
          className="flex-row items-center gap-1.5 active:opacity-60">
          <Icon name="pencil" size={14} color={c.primary} />
          <Text className="font-sans-semibold text-[13px] text-primary">Edit</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${address.label} address`}
          hitSlop={8}
          className="flex-row items-center gap-1.5 active:opacity-60">
          <Icon name="trash-2" size={14} color={c.error} />
          <Text className="font-sans-semibold text-[13px] text-error">Delete</Text>
        </Pressable>
        {!address.isDefault ? (
          <Pressable
            onPress={onSetDefault}
            accessibilityRole="button"
            accessibilityLabel={`Set ${address.label} address as default`}
            hitSlop={8}
            className="ml-auto active:opacity-60">
            <Text className="font-sans-semibold text-[13px] text-link">Set as default</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Placeholder with the same silhouette as <AddressCard>, so the swap to real data doesn't jump. */
export function AddressCardSkeleton() {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <Skeleton className="h-6 w-20 rounded-full" />
      <View className="gap-1.5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </View>
      <View className="gap-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </View>
      <Skeleton className="mt-1 h-4 w-2/3" />
    </View>
  );
}