import Slider from '@react-native-community/slider';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Stars } from '@/components/Stars';
import { useThemeColors } from '@/hooks/useThemeColors';

const RATING_OPTIONS = [4, 3, 2];
const SORT_OPTIONS = [
  { value: '', label: 'Featured' },
  { value: 'priceLow', label: 'Price: Low to High' },
  { value: 'priceHigh', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
];

/**
 * Ported from FiltersSidebar.jsx as rendered inside ProductsPage's mobile
 * `.mobile-bottom-sheet` — so this includes that wrapper's drag handle and
 * corner close button, plus the sidebar's own header/search/category/price/
 * rating/sort sections and the sheet's full-width confirm button.
 *
 * The in-sheet search input is back: it IS in the source's mobile sheet (bound
 * to the same `search` state the screen's top search bar edits), and this port
 * previously dropped it as redundant. It's a duplicate by design on web —
 * editing either field updates the same filter — so it's restored here for
 * layout parity, with `search`/`setSearch` threaded through from the screen.
 */
export function FiltersSheet({
  visible,
  onClose,
  categories,
  selectedCategories,
  setSelectedCategories,
  minPrice,
  setMinPrice,
  maxPrice,
  minRating,
  setMinRating,
  sort,
  setSort,
  search,
  setSearch,
  onClear,
  resultCount,
}) {
  const c = useThemeColors();

  const toggleCategory = (cat) => {
    setSelectedCategories(
      selectedCategories.includes(cat)
        ? selectedCategories.filter((x) => x !== cat)
        : [...selectedCategories, cat]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-overlay" onPress={onClose} />
      <SafeAreaView className="rounded-t-3xl bg-surface">
        {/* `.mobile-bottom-sheet-handle` + the sheet's absolute close button */}
        <View className="items-center pt-2.5">
          <View className="h-1 w-10 rounded-full bg-border-strong" />
        </View>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close filters"
          accessibilityRole="button"
          className="absolute right-4 top-3 z-10 h-8 w-8 items-center justify-center active:opacity-60">
          <Icon name="x" size={18} color={c.muted} />
        </Pressable>

        <ScrollView className="max-h-[85vh] px-6 pt-2">
          <View className="mb-5 flex-row items-center justify-between">
            <Text className="font-sans-bold text-lg text-ink">Filters</Text>
            <Pressable onPress={onClear} className="active:opacity-60">
              <Text className="font-sans-semibold text-sm text-primary">Reset</Text>
            </Pressable>
          </View>

          <View className="gap-6 pb-8">
            <View className="flex-row items-center gap-2 rounded-xl bg-surface-muted px-4">
              <Icon name="search" size={16} color={c.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search products..."
                placeholderTextColor={c.muted}
                returnKeyType="search"
                className="h-11 flex-1 font-sans text-sm text-ink"
              />
            </View>

            <View>
              <Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wide text-muted">
                Category
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {categories.map((cat) => {
                  const active = selectedCategories.includes(cat);
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => toggleCategory(cat)}
                      className={`rounded-full border px-3.5 py-2 active:opacity-70 ${
                        active ? 'border-primary bg-primary' : 'border-border bg-surface'
                      }`}>
                      <Text
                        className={`font-sans-semibold text-xs capitalize ${
                          active ? 'text-inverse' : 'text-body'
                        }`}>
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <View className="mb-2.5 flex-row items-center justify-between">
                <Text className="font-sans-semibold text-xs uppercase tracking-wide text-muted">
                  Min Price
                </Text>
                <Text className="font-sans-bold text-sm text-ink">
                  ₹{Number(minPrice).toLocaleString()}
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={maxPrice}
                step={1}
                value={minPrice}
                onValueChange={setMinPrice}
                minimumTrackTintColor={c.primary}
                maximumTrackTintColor={c.borderStrong}
                thumbTintColor={c.primary}
              />
              <View className="mt-1.5 flex-row items-center justify-between">
                <Text className="font-sans text-[11px] text-muted">₹0</Text>
                <Text className="font-sans text-[11px] text-muted">
                  ₹{Number(maxPrice).toLocaleString()}
                </Text>
              </View>
            </View>

            <View>
              <Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wide text-muted">
                Rating
              </Text>
              <View className="gap-2.5">
                {RATING_OPTIONS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setMinRating(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: minRating === r }}
                    className="flex-row items-center gap-2 active:opacity-70">
                    <View
                      className={`h-4 w-4 items-center justify-center rounded-full border-2 ${
                        minRating === r ? 'border-primary' : 'border-border-strong'
                      }`}>
                      {minRating === r ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
                    </View>
                    <Stars rating={r} size={14} round={false} />
                    <Text className="font-sans-medium text-sm text-body">&amp; Up</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wide text-muted">
                Sort By
              </Text>
              <View className="gap-2">
                {SORT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSort(opt.value)}
                    className={`flex-row items-center justify-between rounded-xl border px-4 py-3 active:opacity-70 ${
                      sort === opt.value
                        ? 'border-primary bg-surface-muted'
                        : 'border-border bg-surface'
                    }`}>
                    <Text className="font-sans-medium text-sm text-ink">{opt.label}</Text>
                    {sort === opt.value ? <Icon name="check" size={16} color={c.primary} /> : null}
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              onPress={onClose}
              className="h-12 items-center justify-center rounded-full bg-primary active:opacity-80">
              <Text className="font-sans-bold text-base text-inverse">
                Show {resultCount} Results
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}