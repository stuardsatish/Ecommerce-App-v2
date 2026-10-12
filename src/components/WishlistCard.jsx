import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { nextAddQuantity, upsertCartItem } from '@/services/supabaseCart';
import { removeWishlistItem } from '@/services/supabaseWishlist';
import { addCart } from '@/store/CartSlice';
import { removeWishlist } from '@/store/WishlistSlice';

const LOW_STOCK = 5;

/**
 * Ported from WishlistPage.jsx's mobile card (lines ~212-249), with the
 * desktop-only stock badge / Notify Me flow (lines ~316-359) grafted on —
 * flagged in wishlist.jsx's header comment, same rationale as Phase 10's
 * promo section: Phase 12's own spec explicitly lists "notify-me
 * (stock_alerts insert)" as an objective, and the mobile source layout has
 * NO out-of-stock handling at all (an out-of-stock item would show a normal,
 * enabled "Add to Cart" button with zero indication). Reuses the desktop's
 * exact `stockInfo` logic and `stock_alerts` insert, just laid out on the
 * mobile card.
 *
 * Also fixes a `$` → `₹` currency-symbol slip in the mobile price display
 * (same class of bug already fixed once in Phase 8's ProductCard) — flagged,
 * not silent. The desktop's MRP-strikethrough comparison (`mrpOf`, reading
 * `product.mrp`/`product.originalPrice`) is NOT ported: `mapProductRow`
 * never sets either field, so that comparison is always `0 > price` (always
 * false) on both platforms — confirmed dead on real data, nothing to port.
 */
export function WishlistCard({ item, liveProduct }) {
  const dispatch = useDispatch();
  const c = useThemeColors();
  const cartItems = useSelector((state) => state.cart.cartItems);
  const user = useSelector((state) => state.user.user);
  const [notified, setNotified] = useState(false);

  const pid = item.productId || item.id;
  const image = liveProduct?.thumbnail || liveProduct?.image || item.thumbnail || item.image;

  const stock = Number(liveProduct?.stock);
  const stockInfo = Number.isFinite(stock)
    ? stock <= 0
      ? { status: 'OUT', label: 'Out of Stock' }
      : stock <= LOW_STOCK
        ? { status: 'LOW', label: `Only ${stock} left` }
        : { status: 'IN', label: 'In Stock' }
    : { status: 'IN', label: 'In Stock' }; // unknown stock → treat as available, matches source
  const isOutOfStock = stockInfo.status === 'OUT';

  const handleRemove = async () => {
    dispatch(removeWishlist(pid)); // instant UI
    if (!user?.uid) return;
    try {
      await removeWishlistItem(user.uid, pid);
    } catch (err) {
      console.log('wishlist remove persist failed:', err);
    }
  };

  const handleAddToCart = () => {
    const qty = nextAddQuantity(cartItems, pid);
    dispatch(addCart(item));
    upsertCartItem(user?.uid, item, qty);
    toast.success('Added to cart'); // source: WishlistPage's shared handleAddToCart
    router.push('/cart');
  };

  const handleNotify = async () => {
    if (!user?.uid) {
      router.push('/login');
      return;
    }
    try {
      const { error } = await supabase
        .from('stock_alerts')
        .insert({ product_id: String(pid), user_id: user.uid });
      if (error) throw error;
      setNotified(true);
      // Source's handleNotify confirms/reports through toast; this used to
      // succeed silently and fail into console.log only.
      toast.success("We'll notify you when it's back in stock");
    } catch (err) {
      console.log('stock alert failed:', err);
      toast.error('Could not set the alert');
    }
  };

  return (
    <View className="relative flex-1 overflow-hidden rounded-xl bg-surface shadow-card">
      <Pressable
        onPress={handleRemove}
        accessibilityLabel="Remove from wishlist"
        className="absolute right-3 top-3 z-20 h-8 w-8 items-center justify-center rounded-full bg-surface/90 active:opacity-60">
        {/* Source's mobile card removes with `Trash2 size={15}` in primary, not an `✕`. */}
        <Icon name="trash-2" size={15} color={c.primary} />
      </Pressable>

      <Pressable onPress={() => router.push(`/products/${pid}`)} className="w-full bg-surface-muted p-2">
        <Image
          source={{ uri: image }}
          className="aspect-square w-full rounded-lg"
          contentFit="cover"
          transition={150}
          accessibilityLabel={item.title}
        />
        {isOutOfStock ? (
          <View className="absolute inset-2 items-center justify-center rounded-lg bg-overlay">
            <Text className="rounded-xl bg-surface px-3 py-1.5 font-sans-bold text-[11px] uppercase tracking-wide text-ink">
              Out of Stock
            </Text>
          </View>
        ) : null}
      </Pressable>

      <View className="flex-1 p-3">
        <Pressable onPress={() => router.push(`/products/${pid}`)}>
          <Text className="font-sans-semibold text-xs uppercase tracking-wide text-muted">
            {item.category}
          </Text>
          <Text numberOfLines={2} className="mt-1 font-sans-bold text-sm leading-[18px] text-ink">
            {item.title}
          </Text>
        </Pressable>

        <View className="mt-auto gap-2 pt-2.5">
          <Text className="font-sans-semibold text-lg text-ink">
            ₹{Number(item.price || 0).toFixed(2)}
          </Text>

          {isOutOfStock ? (
            <Pressable
              onPress={handleNotify}
              disabled={notified}
              className="h-9 flex-row items-center justify-center gap-1.5 rounded-full bg-border-strong active:opacity-80"
              style={{ opacity: notified ? 0.7 : 1 }}>
              <Icon name="bell" size={15} color={c.body} />
              <Text className="font-sans-bold text-xs uppercase tracking-wide text-body">
                {notified ? 'Notified' : 'Notify Me'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleAddToCart}
              className="h-9 flex-row items-center justify-center gap-1.5 rounded-full bg-primary active:opacity-90">
              <Icon name="shopping-bag" size={14} color={c.inverse} />
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