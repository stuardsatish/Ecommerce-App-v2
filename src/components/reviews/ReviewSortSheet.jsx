import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

export const SORT_LABELS = {
  recent: 'Most recent',
  highest: 'Highest rated',
  lowest: 'Lowest rated',
  helpful: 'Most helpful',
};

/**
 * Bottom sheet for picking the review sort order, same Modal-over-backdrop
 * pattern as FiltersSheet. `options` is the list of sort keys on offer —
 * "helpful" is left out by the caller when voting isn't available.
 * @param {{ visible: boolean, onClose: () => void, options: string[],
 *           value: string, onSelect: (sort: string) => void }} props
 */
export function ReviewSortSheet({ visible, onClose, options, value, onSelect }) {
  const c = useThemeColors();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-overlay" onPress={onClose} />
      <SafeAreaView className="rounded-t-3xl bg-surface" edges={['bottom']}>
        <View className="items-center pt-2.5">
          <View className="h-1 w-10 rounded-full bg-border-strong" />
        </View>
        <View className="px-6 pb-4 pt-3">
          <Text className="mb-2 font-sans-bold text-lg text-ink">Sort reviews</Text>
          {options.map((key) => {
            const active = key === value;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  onSelect(key);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="flex-row items-center justify-between border-b border-border-subtle py-3.5 active:opacity-60">
                <Text className={`text-sm ${active ? 'font-sans-bold text-ink' : 'font-sans text-body'}`}>
                  {SORT_LABELS[key]}
                </Text>
                {active ? <Icon name="check" size={16} color={c.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </Modal>
  );
}