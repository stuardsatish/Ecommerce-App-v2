import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { AppHeader } from '@/components/AppHeader';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { WishlistCard } from '@/components/WishlistCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { mapProductRows } from '@/utils/mappers';

/**
 * Ported from WishlistPage.jsx's mobile layout (2-col grid, remove, add-to-
 * cart-then-navigate, live product join for images) — re-read the actual
 * source rather than the doc summary. Two things confirmed by that re-read:
 *
 * 1. The live `products` join (for up-to-date images/stock) is genuinely
 *    SHARED between mobile and desktop — it's not behind the `isMobile`
 *    branch — so it's ported as-is, not skipped like Phase 9's desktop-only
 *    related-products fetch.
 * 2. Stock-aware badges + "Notify Me" (`stock_alerts` insert) are desktop-
 *    only in source. Ported onto the mobile card anyway (see
 *    WishlistCard.jsx) since Phase 12's own spec lists "notify-me" as an
 *    objective and the mobile layout otherwise has zero out-of-stock
 *    handling — an out-of-stock item would show a normal, enabled "Add to
 *    Cart" button with no indication at all.
 *
 * NOT ported: "Share Wishlist" (desktop-only `navigator.share`/clipboard of
 * `window.location.href`) and "Move All to Cart" (desktop-only bulk action).
 * Share has no RN equivalent worth building here — there's no public,
 * web-hosted wishlist page to share a URL to; this screen is private
 * per-account Redux state, so the source feature's actual subject (a
 * shareable link) doesn't exist on this platform. "Move All" is a desktop
 * convenience beyond Phase 12's stated objectives (which say "move-to-cart,"
 * satisfied per-item by the mobile card's existing Add to Cart action) —
 * skipped the same way Phase 9 skipped related products.
 *
 * Phase 16 addition: the live-product-join fetch used to fail into
 * `console.log` with no visible sign anything was wrong (the wishlist items
 * themselves still render fine from Redux either way, so this isn't a hard
 * failure the way Products'/Orders' fetch failures are — but it was still
 * silent). Now surfaces a small non-blocking banner instead.
 */
export default function WishlistScreen() {
  const c = useThemeColors();
  const wishlistItems = useSelector((state) => state.wishlist.wishlistItems);
  const [productMap, setProductMap] = useState({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [joinError, setJoinError] = useState(false);

  const wishlistKey = wishlistItems.map((i) => i.productId || i.id).join(',');

  useEffect(() => {
    let active = true;
    const fetchProducts = async () => {
      setLoadingProducts(true);
      setJoinError(false);
      try {
        const ids = [...new Set(wishlistItems.map((i) => i.productId || i.id).filter(Boolean))].map(
          String
        );
        if (!ids.length) {
          if (active) setProductMap({});
          return;
        }
        const { data, error } = await supabase.from('products').select('*').in('id', ids);
        if (error) throw error;
        const map = {};
        mapProductRows(data).forEach((p) => {
          map[p.id] = p;
        });
        if (active) setProductMap(map);
      } catch (err) {
        console.log('wishlist product join failed:', err);
        if (active) {
          setProductMap({});
          setJoinError(true);
        }
      } finally {
        if (active) setLoadingProducts(false);
      }
    };
    fetchProducts();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlistKey]);

  if (wishlistItems.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
          <AppHeader title="Wishlist" />
          <View className="flex-1 items-center justify-center gap-4 px-6">
            {/*
              Source's mobile empty state is `<ShoppingBag size={44}
              color="var(--color-border-strong)">` — a bag, not a heart, same
              glyph as the empty cart. The `🤍` this replaces was a port slip.
            */}
            <Icon name="shopping-bag" size={44} color={c.borderStrong} />
            <Text className="font-sans-semibold text-sm text-muted">Your wishlist is empty.</Text>
            <Pressable
              onPress={() => router.push('/products')}
              className="rounded-full bg-primary px-6 py-3">
              <Text className="font-sans-bold text-sm text-inverse">Explore Products</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <AppHeader title="Wishlist" />
        {loadingProducts ? (
          <View className="flex-1 px-5 pt-4">
            <Text className="mb-4 font-sans-bold text-3xl text-ink">Wishlist</Text>
            <View className="flex-row flex-wrap justify-between gap-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={{ width: '48%' }} className="gap-2">
                  <Skeleton className="aspect-square w-full rounded-xl" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-9 w-full rounded-full" />
                </View>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={wishlistItems}
            numColumns={2}
            keyExtractor={(item) => String(item.productId || item.id)}
            columnWrapperStyle={{ gap: 16 }}
            contentContainerClassName="gap-4 px-5 pb-6 pt-4"
            ListHeaderComponent={
              <View className="mb-1 gap-2">
                <Text className="font-sans-bold text-3xl text-ink">Wishlist</Text>
                {joinError ? (
                  <Text className="font-sans-medium text-xs text-error">
                    Could not refresh latest prices/stock — showing saved details.
                  </Text>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <WishlistCard item={item} liveProduct={productMap[item.productId || item.id]} />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}