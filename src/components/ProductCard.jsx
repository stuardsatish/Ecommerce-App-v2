import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { toast } from '@/lib/toast';
import {
  decrementOrRemoveCartItem,
  nextAddQuantity,
  nextRemoveQuantity,
  upsertCartItem,
} from '@/services/supabaseCart';
import { addWishlistItem, removeWishlistItem } from '@/services/supabaseWishlist';
import { addCart, removeCart } from '@/store/CartSlice';
import { addWishlist, removeWishlist } from '@/store/WishlistSlice';

/**
 * Ported from ProductCard.jsx's `variant="mobile"` branch (the only variant
 * RN needs — there's no desktop breakpoint here). Deliberate deviations from
 * the source, all flagged:
 *
 * 1. Rating comes from `product.rating`/`product.reviewCount` (already
 *    computed by the parent's single batched `reviews` query) instead of
 *    each card re-fetching `reviews` itself — the source's per-card fetch is
 *    a confirmed N+1 that's redundant with a computation the parent already
 *    did; skipping it changes nothing the user sees.
 * 2. The price label uses ₹ (matching every other price display in the app)
 *    instead of the source's literal `$` — that was an isolated currency-
 *    symbol slip in this one component, not an intentional USD price.
 * 3. The "please login first" gate raises a toast rather than the source's
 *    native `alert()`, which MIGRATION_ANALYSIS.md §5 already flags as an
 *    inconsistency with the toast pattern used everywhere else in the app.
 *
 * Everything else — cart/wishlist mutation logic, stock-label thresholds,
 * layout — is a direct port. `expo-image` replaces RN's `Image` for the
 * product photo: these are remote Supabase Storage/CDN URLs rendered many at
 * a time in a scrolling grid, which is exactly the disk/memory-caching case
 * §4's DOM→RN mapping table recommends it for.
 */
function ProductCardBase({ product }) {
  const dispatch = useDispatch();
  const store = useStore();
  const c = useThemeColors();
  const productId = String(product.id);

  // Narrow subscriptions. Selecting the whole `cartItems`/`wishlistItems`
  // arrays made every card in the grid re-render on any cart or wishlist
  // change, because each mutation yields a new array reference — tapping "+"
  // on one card re-rendered the entire catalog. These select only what this
  // card renders: Immer's structural sharing keeps the found item's identity
  // stable while it is untouched, and `isWishlisted` is a plain boolean, so
  // an unrelated change to a different product no longer re-renders this one.
  const existingItem = useSelector((state) =>
    state.cart.cartItems.find((item) => String(item.id) === productId)
  );
  const isWishlisted = useSelector((state) =>
    state.wishlist.wishlistItems.some((item) => String(item.id) === productId)
  );
  const user = useSelector((state) => state.user.user);

  // The quantity helpers need the whole cart, but only at the moment of a tap.
  // Reading it from the store there keeps it out of the render subscription.
  const getCartItems = () => store.getState().cart.cartItems;

  const stock = product.stock || 0;
  const isOutOfStock = stock <= 0;
  const avgRating = Number(product.rating || 0);
  const reviewCount = Number(product.reviewCount || 0);

  const handleWishlist = async () => {
    if (!user) {
      toast.error('Please login first');
      return;
    }
    try {
      if (isWishlisted) {
        dispatch(removeWishlist(productId));
        await removeWishlistItem(user.uid, productId);
      } else {
        dispatch(
          addWishlist({
            userId: user.uid,
            productId,
            id: productId,
            title: product.title,
            price: product.price,
            image: product.thumbnail || product.image,
            category: product.category,
            addedAt: new Date().toISOString(),
          })
        );
        await addWishlistItem(user.uid, product);
      }
    } catch (error) {
      console.log('Wishlist error:', error);
    }
  };

  const handleIncrement = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    const qty = nextAddQuantity(getCartItems(), productId);
    dispatch(addCart(product));
    upsertCartItem(user.uid, product, qty);
  };

  const handleDecrement = () => {
    const qty = nextRemoveQuantity(getCartItems(), productId);
    dispatch(removeCart(productId));
    decrementOrRemoveCartItem(user?.uid, productId, qty);
  };

  let stockText;
  let stockItalic;
  if (isOutOfStock) {
    stockText = 'Out of Stock';
    stockItalic = true;
  } else if (stock <= 5) {
    stockText = `${stock} left`;
    stockItalic = false;
  } else {
    stockText = 'In Stock';
    stockItalic = true;
  }

  const goToProduct = () => router.push(`/products/${productId}`);

  return (
    <View
      className="relative w-full overflow-hidden rounded-xl bg-surface shadow-card"
      style={{ minHeight: 347 }}>
      <Pressable
        onPress={handleWishlist}
        accessibilityLabel="Toggle wishlist"
        accessibilityRole="button"
        className="absolute right-3 top-3 z-20 h-8 w-8 items-center justify-center rounded-full bg-surface/90 active:opacity-60">
        <Icon
          name={isWishlisted ? 'heart-filled' : 'heart'}
          size={16}
          color={isWishlisted ? c.primary : c.muted}
        />
      </Pressable>

      <Pressable onPress={goToProduct} className="w-full bg-surface-muted p-2">
        <Image
          source={{ uri: product.thumbnail || product.image }}
          style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }}
          contentFit="cover"
          transition={150}
        />
      </Pressable>

      <View className="flex-1 p-3">
        <Pressable onPress={goToProduct}>
          <Text className="font-sans-semibold text-xs uppercase tracking-wide text-muted">
            {product.category}
          </Text>
          <Text numberOfLines={2} className="mt-1 font-sans-bold text-sm leading-[18px] text-ink">
            {product.title}
          </Text>
          <View className="mt-1.5 flex-row items-center gap-1">
            <Icon name="star-filled" size={11} color={c.chartGold} />
            <Text className="font-sans text-[11px] text-muted">
              {reviewCount > 0 ? `${avgRating.toFixed(1)} (${reviewCount})` : 'No reviews'}
            </Text>
          </View>
        </Pressable>

        <View className="mt-auto">
          <View className="mb-2 mt-2.5 flex-row items-center justify-between">
            <Text className="font-sans-semibold text-lg text-ink">
              ₹{Number(product.price || 0).toFixed(2)}
            </Text>
            <Text
              className="font-sans-medium text-[10px] text-primary"
              style={stockItalic ? { fontStyle: 'italic' } : undefined}>
              {stockText}
            </Text>
          </View>

          {isOutOfStock ? (
            <View className="h-9 items-center justify-center rounded-full bg-surface-muted">
              <Text className="font-sans-bold text-xs uppercase tracking-wide text-muted">
                Out of Stock
              </Text>
            </View>
          ) : existingItem ? (
            <View className="h-9 flex-row items-center justify-between overflow-hidden rounded-full border border-primary">
              <Pressable
                onPress={handleDecrement}
                accessibilityLabel="Decrease quantity"
                className="h-full flex-1 items-center justify-center active:opacity-60">
                <Icon name="minus" size={14} color={c.primary} />
              </Pressable>
              <Text className="min-w-[20px] text-center font-sans-bold text-sm text-ink">
                {existingItem.quantity}
              </Text>
              <Pressable
                onPress={handleIncrement}
                disabled={existingItem.quantity >= stock}
                accessibilityLabel="Increase quantity"
                className="h-full flex-1 items-center justify-center active:opacity-60">
                <Icon
                  name="plus"
                  size={14}
                  color={existingItem.quantity >= stock ? c.disabledFg : c.primary}
                />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleIncrement}
              className="h-9 items-center justify-center rounded-full bg-primary active:opacity-80">
              <Text className="font-sans-bold text-xs uppercase tracking-wide text-inverse">
                Add to Cart
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Memoised. The catalog renders these in a grid, and `product` objects come
 * from a memoised selector, so their identity is stable between unrelated
 * renders — without `memo` a parent re-render still walked every card.
 */
export const ProductCard = memo(ProductCardBase);