import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { FiltersSheet } from '@/components/FiltersSheet';
import { Icon } from '@/components/Icon';
import { ProductCard } from '@/components/ProductCard';
import { ProductCardSkeleton } from '@/components/ProductCardSkeleton';
import { PromoBanner } from '@/components/PromoBanner';
import { SearchSuggestions } from '@/components/SearchSuggestions';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { addProduct } from '@/store/ProductSlice';
import { mapProductRows } from '@/utils/mappers';
import { listPriceSummary } from '@/utils/purchaseOptions';
import { getRecentlyViewedIds } from '@/utils/recentlyViewed';
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
} from '@/utils/searchHistory';

// The price the list card shows: the MAIN price, or the lowest variant price when the main product is not sold
// (utils/purchaseOptions listPriceSummary). Filters and sorting must agree with what the shopper sees.
const listPrice = (product) => Number(listPriceSummary(product).price || 0);

/**
 * Ported from Ecommerce-sept-1-2026/src/pages/ProductsPage/ProductsPage.jsx's
 * mobile branch (isMobile ≤640px) — RN only has this one form factor, the
 * desktop branch (NewProductCard, richer sidebar) isn't ported. The dead
 * `<nav>` bottom bar the source keeps around (display:none, "superseded by
 * the global MobileNav tab bar") is skipped entirely rather than ported and
 * hidden — our real Expo Router tab bar already does that job.
 *
 * Phase 16 addition: a fetch failure used to just `console.log` and fall
 * through to the ordinary "No products available" empty state — visually
 * identical to genuinely having no catalog. Now tracked separately with
 * ErrorState + retry, this screen's own version of the exact gap the phase
 * doc calls out by name ("console-only errors on ProductsPage fetch
 * failure").
 */
export default function ProductsScreen() {
  const dispatch = useDispatch();
  const c = useThemeColors();
  const products = useSelector((state) => state.products.product);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [minPrice, setMinPrice] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState('');
  const [search, setSearch] = useState('');
  const [recentlyViewedIds, setRecentlyViewedIds] = useState([]);

  // Task 2.1 — autocomplete panel state. `searchFocused` gates the overlay so
  // it only covers the catalog while the user is actually in the search box.
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  // Re-read on every focus (not just mount) so a product viewed on the PDP
  // shows up here the moment the user taps back to this tab.
  useFocusEffect(
    useCallback(() => {
      getRecentlyViewedIds().then(setRecentlyViewedIds);
      getRecentSearches().then(setRecentSearches);
    }, [])
  );

  // Task 2.1 — history writes. Each handler re-reads through the util rather
  // than mutating local state directly, so what's on screen is always what's
  // actually persisted.
  const commitSearch = useCallback(async (term) => {
    const cleaned = String(term || '').trim();
    if (!cleaned) return;
    setSearch(cleaned);
    setSearchFocused(false);
    Keyboard.dismiss();
    await addRecentSearch(cleaned);
    setRecentSearches(await getRecentSearches());
  }, []);

  const handleRemoveRecent = useCallback(async (term) => {
    await removeRecentSearch(term);
    setRecentSearches(await getRecentSearches());
  }, []);

  const handleClearRecents = useCallback(async () => {
    await clearRecentSearches();
    setRecentSearches([]);
  }, []);

  // Tapping a product suggestion jumps straight to its PDP — the user already
  // named the exact item, so making them read a one-result list first is a
  // wasted step. The term is still recorded, so it's there next time.
  const handlePickProduct = useCallback(
    async (product) => {
      setSearchFocused(false);
      Keyboard.dismiss();
      await addRecentSearch(product.title);
      setRecentSearches(await getRecentSearches());
      router.push(`/products/${product.id}`);
    },
    []
  );

  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setFetchError(false);

      const { data: productRows, error: productError } = await supabase.from('products').select('*');
      if (productError) throw productError;

      const { data: reviewsData } = await supabase.from('reviews').select('product_id, rating');

      const ratingsMap = {};
      (reviewsData || []).forEach((review) => {
        const pid = String(review.product_id);
        if (!ratingsMap[pid]) ratingsMap[pid] = { total: 0, count: 0 };
        ratingsMap[pid].total += Number(review.rating || 0);
        ratingsMap[pid].count += 1;
      });

      const productArray = mapProductRows(productRows).map((p) => {
        const ratingInfo = ratingsMap[p.id];
        const avgRating = ratingInfo ? ratingInfo.total / ratingInfo.count : 0;
        return { ...p, rating: avgRating, reviewCount: ratingInfo ? ratingInfo.count : 0 };
      });

      dispatch(addProduct(productArray));
    } catch (error) {
      console.log('Error fetching products:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!productsRef.current.length) {
      fetchProducts();
    }
    // Intentionally run once on mount only, matching the source app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFilters = () => {
    setSelectedCategories([]);
    setMinPrice(0);
    setMinRating(0);
    setSort('');
    setSearch('');
  };

  const { filteredProducts, groupedProducts } = useMemo(() => {
    // Lower-cased once, not once per product — this predicate runs across the
    // whole catalog on every keystroke.
    const needle = search.toLowerCase();
    let filtered = products.filter(
      (product) =>
        (selectedCategories.length ? selectedCategories.includes(product.category) : true) &&
        listPrice(product) >= minPrice &&
        Number(product.rating || 0) >= minRating &&
        product.title?.toLowerCase().includes(needle)
    );

    // Price filter / sort use the price the card SHOWS (main price, or the lowest variant when the main product is not sold)
    if (sort === 'priceLow') filtered.sort((a, b) => listPrice(a) - listPrice(b));
    else if (sort === 'priceHigh') filtered.sort((a, b) => listPrice(b) - listPrice(a));
    else if (sort === 'rating') filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    const grouped = filtered.reduce((acc, product) => {
      if (!acc[product.category]) acc[product.category] = [];
      acc[product.category].push(product);
      return acc;
    }, {});

    return { filteredProducts: filtered, groupedProducts: grouped };
  }, [products, selectedCategories, minPrice, minRating, sort, search]);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);

  const maxPriceValue = useMemo(() => {
    if (products.length === 0) return 2000;
    // reduce, not `Math.max(...array)`. Spreading passes one ARGUMENT per
    // product, and the JS engine's argument limit is finite (~65k on
    // Hermes/JSC) — a catalog that size would throw RangeError here and take
    // the whole screen down rather than degrade.
    return products.reduce((max, p) => {
      const price = listPrice(p);
      return price > max ? price : max;
    }, 0);
  }, [products]);

  const activeFilterCount =
    selectedCategories.length +
    (minPrice > 0 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (sort ? 1 : 0) +
    (search ? 1 : 0);

  // Memoised because this is the FlatList's `data`. Rebuilt inline it was a
  // fresh array of fresh objects on every render, so every unrelated state
  // change (search keystroke, sheet open/close) changed `data` by reference
  // and re-rendered every section and every card inside it.
  const categorySections = useMemo(
    () =>
      Object.keys(groupedProducts).map((category) => ({
        category,
        items: groupedProducts[category],
      })),
    [groupedProducts]
  );

  // Independent of the search/filter state above — recently viewed is a
  // standing shelf, not something the catalog filters should hide.
  const recentlyViewedProducts = useMemo(() => {
    if (!recentlyViewedIds.length || !products.length) return [];
    const byId = new Map(products.map((p) => [String(p.id), p]));
    return recentlyViewedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [recentlyViewedIds, products]);

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <AppHeader title="Products" />
        <View className="flex-row items-center gap-3 px-5 py-4">
          <View className="flex-1 flex-row items-center gap-2 rounded-xl bg-surface-muted px-4">
            <Icon name="search" size={15} color={c.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onSubmitEditing={() => commitSearch(search)}
              placeholder="Search for items..."
              placeholderTextColor={c.muted}
              returnKeyType="search"
              className="h-11 flex-1 font-sans text-sm text-ink"
            />
            {search ? (
              <Pressable
                onPress={() => setSearch('')}
                accessibilityLabel="Clear search"
                hitSlop={8}
                className="active:opacity-60">
                <Icon name="x" size={15} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
          {/* Task 2.1 — while the search pane is open the filters button is
              replaced by "Cancel". Dismissal is explicit rather than via
              TextInput's onBlur: blur fires before a suggestion's press
              lands, so an onBlur-driven close would swallow the tap. */}
          {searchFocused ? (
            <Pressable
              onPress={() => {
                setSearchFocused(false);
                Keyboard.dismiss();
              }}
              accessibilityRole="button"
              className="h-11 items-center justify-center px-1 active:opacity-60">
              <Text className="font-sans-semibold text-[13px] text-primary">Cancel</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setFilterOpen(true)}
              accessibilityLabel="Filters"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-xl bg-surface-muted active:opacity-70">
              <Icon name="sliders-horizontal" size={18} color={c.muted} />
              {activeFilterCount > 0 && (
                <View className="absolute -right-1 -top-1 h-4 min-w-[16px] items-center justify-center rounded-full border border-background bg-primary px-1">
                  <Text className="text-[9px] font-sans-bold text-inverse">{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>

        {searchFocused ? (
          <SearchSuggestions
            query={search}
            products={products}
            recentSearches={recentSearches}
            onPickTerm={commitSearch}
            onPickProduct={handlePickProduct}
            onRemoveRecent={handleRemoveRecent}
            onClearRecents={handleClearRecents}
          />
        ) : loading ? (
          <View className="flex-row flex-wrap justify-between gap-y-4 px-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={{ width: '48%' }}>
                <ProductCardSkeleton />
              </View>
            ))}
          </View>
        ) : fetchError && products.length === 0 ? (
          <ErrorState message="Couldn't load products." onRetry={fetchProducts} />
        ) : categorySections.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-3.5 px-5" style={{ minHeight: 300 }}>
            <Text className="text-center font-sans-semibold text-sm text-muted">
              {activeFilterCount > 0
                ? 'No products match your filters.'
                : 'No products available right now.'}
            </Text>
            {activeFilterCount > 0 && (
              <Pressable onPress={clearFilters}>
                <Text className="font-sans-bold text-xs text-primary">Clear filters</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={categorySections}
            keyExtractor={(section) => section.category}
            contentContainerClassName="gap-6 px-5 pb-6"
            ListHeaderComponent={
              <View className="gap-6">
                {/* Task 2.4 — renders only when a promotion is configured and
                    still running; self-hides otherwise. */}
                <PromoBanner />
                {recentlyViewedProducts.length > 0 ? (
                  <View className="gap-3">
                    <Text className="font-sans-bold text-lg text-ink">Recently Viewed</Text>
                    <FlatList
                      data={recentlyViewedProducts}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(product) => String(product.id)}
                      contentContainerClassName="gap-3"
                      renderItem={({ item: product }) => (
                        <View style={{ width: 160 }}>
                          <ProductCard product={product} />
                        </View>
                      )}
                    />
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item: section }) => (
              <View>
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="font-sans-bold text-lg capitalize text-ink">{section.category}</Text>
                  <Text className="font-sans-medium text-xs text-muted">
                    {section.items.length} items
                  </Text>
                </View>
                <View className="flex-row flex-wrap justify-between gap-y-4">
                  {section.items.map((product) => (
                    <View key={product.id} style={{ width: '48%' }}>
                      <ProductCard product={product} />
                    </View>
                  ))}
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>

      <FiltersSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categories}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        minPrice={minPrice}
        setMinPrice={setMinPrice}
        maxPrice={maxPriceValue}
        minRating={minRating}
        setMinRating={setMinRating}
        sort={sort}
        setSort={setSort}
        search={search}
        setSearch={setSearch}
        onClear={clearFilters}
        resultCount={filteredProducts.length}
      />
    </View>
  );
}