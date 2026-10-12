import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Compact "Delivery & Returns" reassurance block (roadmap task 1.16).
 *
 * Shown on the product page and in the cart — the two points where a buyer is
 * deciding whether to commit and wants the delivery/returns terms to hand.
 * Deliberately a link rather than inlined copy: the policies themselves read
 * live `shippingSettings`/`invoiceSettings`, so duplicating their text here
 * would risk the two drifting apart.
 */
export function PolicyLinks({ className = '' }) {
  const c = useThemeColors();

  const rows = [
    {
      icon: 'truck',
      label: 'Delivery & shipping charges',
      path: '/support/shipping',
    },
    {
      icon: 'rotate-ccw',
      label: 'Returns & refunds',
      path: '/support/returns',
    },
  ];

  return (
    <View className={`overflow-hidden rounded-xl border border-border ${className}`}>
      {rows.map((row, i) => (
        <Pressable
          key={row.path}
          onPress={() => router.push(row.path)}
          accessibilityRole="button"
          className={`flex-row items-center justify-between bg-surface p-4 active:bg-surface-muted ${
            i > 0 ? 'border-t border-border' : ''
          }`}>
          <View className="flex-1 flex-row items-center gap-3">
            <Icon name={row.icon} size={17} color={c.primary} />
            <Text className="font-sans-medium text-[13px] text-ink">{row.label}</Text>
          </View>
          <Icon name="chevron-right" size={16} color={c.muted} />
        </Pressable>
      ))}
    </View>
  );
}