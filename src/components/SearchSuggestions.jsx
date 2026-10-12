import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Autocomplete / recent-searches panel for the catalog search box
 * (roadmap task 2.1).
 *
 * Two modes, chosen by whether anything has been typed:
 *   - empty query → the user's own recent searches, each removable, plus a
 *     "Clear all". Nothing is shown at all if they have no history, so a
 *     first-time user doesn't get an empty box.
 *   - non-empty query → live suggestions drawn from the already-loaded
 *     catalog: matching categories first (they narrow the most), then matching
 *     product titles. No network call — `products` is the same array the
 *     screen already filters against.
 *
 * Rendered INLINE, taking the catalog's place while the search box is active,
 * rather than as a floating dropdown: an absolutely-positioned panel
 * overhanging its parent gets clipped on Android, and a full-pane search mode
 * is the more native pattern on a phone anyway. The caller restores the
 * catalog when the search is committed or cancelled.
 */
export function SearchSuggestions({
  query,
  products,
  recentSearches,
  onPickTerm,
  onPickProduct,
  onRemoveRecent,
  onClearRecents,
}) {
  const c = useThemeColors();
  const needle = query.trim().toLowerCase();

  // --- empty query: recent searches ---
  if (!needle) {
    // Nothing typed and no history yet — a first run. Show a hint rather than
    // an empty card, since in inline mode this pane replaces the catalog.
    if (!recentSearches.length) {
      return (
        <Panel>
          <View className="items-center gap-2 px-6 py-8">
            <Icon name="search" size={22} color={c.muted} />
            <Text className="text-center font-sans text-sm text-muted">
              Start typing to search the catalogue by product or category.
            </Text>
          </View>
        </Panel>
      );
    }
    return (
      <Panel>
        <View className="flex-row items-center justify-between px-4 pb-1 pt-3">
          <Text className="font-sans-semibold text-[11px] uppercase tracking-wide text-muted">
            Recent Searches
          </Text>
          <Pressable onPress={onClearRecents} hitSlop={8} className="active:opacity-60">
            <Text className="font-sans-semibold text-[11px] text-primary">Clear all</Text>
          </Pressable>
        </View>
        {recentSearches.map((term) => (
          <View key={term} className="flex-row items-center">
            <Pressable
              onPress={() => onPickTerm(term)}
              accessibilityRole="button"
              className="flex-1 flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted">
              <Icon name="clock" size={15} color={c.muted} />
              <Text className="flex-1 font-sans text-sm text-ink" numberOfLines={1}>
                {term}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onRemoveRecent(term)}
              accessibilityLabel={`Remove ${term} from recent searches`}
              hitSlop={8}
              className="px-4 py-3 active:opacity-60">
              <Icon name="x" size={14} color={c.muted} />
            </Pressable>
          </View>
        ))}
      </Panel>
    );
  }

  // --- typed query: category + product-title matches ---
  const categoryMatches = [...new Set(products.map((p) => p.category).filter(Boolean))]
    .filter((cat) => String(cat).toLowerCase().includes(needle))
    .slice(0, 3);

  const productMatches = products
    .filter((p) => p.title?.toLowerCase().includes(needle))
    .slice(0, 6);

  if (!categoryMatches.length && !productMatches.length) {
    return (
      <Panel>
        <View className="px-4 py-4">
          <Text className="font-sans text-sm text-muted">
            No matches for &ldquo;{query.trim()}&rdquo;
          </Text>
        </View>
      </Panel>
    );
  }

  return (
    <Panel>
      <ScrollView keyboardShouldPersistTaps="handled">
        {categoryMatches.map((cat) => (
          <Pressable
            key={`cat-${cat}`}
            onPress={() => onPickTerm(cat)}
            accessibilityRole="button"
            className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted">
            <Icon name="sliders-horizontal" size={15} color={c.muted} />
            <Text className="flex-1 font-sans text-sm text-ink" numberOfLines={1}>
              {cat}
            </Text>
            <Text className="font-sans text-[11px] text-muted">Category</Text>
          </Pressable>
        ))}
        {productMatches.map((p) => (
          <Pressable
            key={`prod-${p.id}`}
            onPress={() => onPickProduct(p)}
            accessibilityRole="button"
            className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted">
            <Icon name="search" size={15} color={c.muted} />
            <Text className="flex-1 font-sans text-sm text-ink" numberOfLines={1}>
              {p.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Panel>
  );
}

const Panel = ({ children }) => (
  <View className="mx-5 flex-1 overflow-hidden rounded-xl border border-border bg-surface">
    {children}
  </View>
);