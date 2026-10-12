import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * The "Deliver to" card at the top of the cart's checkout area (roadmap task
 * 4.2). `address` is the customer's default address as `describeProfileAddress`
 * returns it, or null when they have none — then the card is a call to action
 * rather than an empty box, since COD can't be placed without an address.
 */
export function DeliverToCard({ address, onChange, onAdd }) {
  const c = useThemeColors();

  if (!address) {
    return (
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add delivery address"
        className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface p-4 active:opacity-70">
        <Icon name="map-pin" size={20} color={c.primary} />
        <View className="flex-1">
          <Text className="font-sans-semibold text-sm text-ink">Add delivery address</Text>
          <Text className="text-xs text-muted">Tell us where to deliver this order.</Text>
        </View>
        <Icon name="plus" size={18} color={c.primary} />
      </Pressable>
    );
  }

  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon name="map-pin" size={16} color={c.primary} />
          <Text className="font-sans-semibold text-sm text-ink">Deliver to</Text>
          {address.label ? (
            <View className="rounded-full bg-surface-muted px-2 py-0.5">
              <Text className="font-sans-semibold text-[10px] text-body">{address.label}</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={onChange}
          accessibilityRole="button"
          accessibilityLabel="Change delivery address"
          hitSlop={8}
          className="active:opacity-60">
          <Text className="font-sans-bold text-[13px] text-primary">Change</Text>
        </Pressable>
      </View>
      <View className="gap-0.5">
        {address.name || address.phone ? (
          <Text className="font-sans-semibold text-[13px] text-ink">
            {address.name}
            {address.name && address.phone ? ' · ' : ''}
            {address.phone}
          </Text>
        ) : null}
        <Text className="text-[13px] leading-5 text-body">{address.line}</Text>
        {address.landmark ? <Text className="text-xs text-muted">Landmark: {address.landmark}</Text> : null}
      </View>
    </View>
  );
}