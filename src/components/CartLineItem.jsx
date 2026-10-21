import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  decrementOrRemoveCartItem,
  nextAddQuantity,
  nextRemoveQuantity,
  upsertCartItem,
} from '@/services/supabaseCart';
import { addCart, removeCart } from '@/store/CartSlice';
import { isDiscountActive } from '@/utils/pricing';

/**
 * Ported from CartPage.jsx's mobile card layout (the `isMobile` branch's
 * per-item card, lines ~740-903 of the source). Self-contained (own
 * dispatch/Supabase calls), matching the established ProductCard.jsx
 * convention rather than prop-drilling handlers from the screen.
 *
 * Passes the full Redux cart `item` object (not a compound-id string) to
 * `decrementOrRemoveCartItem`/`upsertCartItem` — same as the source does —
 * since every cart item already carries a `productId` (from mapProductRow)
 * and, for variant purchases, `variant_id`, which `parseCartIds`'s object
 * branch in supabaseCart.js resolves correctly. See [id].jsx's Phase 9 note
 * for why a raw compound string would resolve wrong.
 *
 * `expo-image` replaces RN's `Image` for the thumbnail for the same reason
 * ProductCard.jsx uses it: remote Supabase Storage/CDN URLs in a scrolling
 * list, which is the disk/memory-caching case MIGRATION_ANALYSIS.md §4
 * recommends it for.
 */
export function CartLineItem({ item, onSaveForLater, savingForLater = false }) {
  const dispatch = useDispatch();
  const c = useThemeColors();
  const cartItems = useSelector((state) => state.cart.cartItems);
  const user = useSelector((state) => state.user.user);

  const cartId = item.id || item.compound_id;

  const handleIncrement = () => {
    const qty = nextAddQuantity(cartItems, cartId);
    dispatch(addCart({ ...item, qtyToAdd: 1 }));
    upsertCartItem(user?.uid, item, qty);
  };

  const handleDecrement = () => {
    const qty = nextRemoveQuantity(cartItems, cartId);
    dispatch(removeCart(cartId));
    decrementOrRemoveCartItem(user?.uid, item, qty);
  };

  const price = Number(item.price);
  const qty = Number(item.quantity);
  const discount = isDiscountActive(item) ? Number(item.discount || 0) : 0;
  const originalTotal = price * qty;
  const discountedTotal = originalTotal - (originalTotal * discount) / 100;

  return (
    <View className="flex-row gap-3 rounded-xl bg-surface p-3 shadow-card">
      <View className="h-20 w-20 items-center justify-center rounded-lg bg-surface-muted p-2">
        <Image
          source={{ uri: item.thumbnail || item.image }}
          className="h-full w-full rounded"
          contentFit="cover"
          transition={150}
          accessibilityLabel={item.title}
        />
      </View>

      <View className="flex-1 justify-between" style={{ minWidth: 0 }}>
        <View>
          <Text className="font-sans-semibold text-[11px] uppercase tracking-wide text-muted">
            {item.category}
          </Text>
          <Text
            numberOfLines={2}
            className="mt-0.5 font-sans-bold text-sm leading-[18px] text-ink">
            {item.title}
          </Text>
          {item.variant_name ? (
            <Text numberOfLines={1} className="font-sans-medium text-xs text-body">
              {item.variant_name}
            </Text>
          ) : null}
          {item.unavailable ? (
            <Text className="font-sans-bold text-[11px] text-error">NO LONGER AVAILABLE</Text>
          ) : null}
        </View>

        <View className="flex-row items-center justify-between pt-2">
          <View className="flex-row items-center overflow-hidden rounded-full border border-border">
            <Pressable
              onPress={handleDecrement}
              accessibilityLabel="Decrease quantity"
              className="h-[30px] w-[30px] items-center justify-center active:opacity-60">
              <Icon name="minus" size={14} color={c.primary} />
            </Pressable>
            <Text className="min-w-[24px] text-center font-sans-bold text-[13px] text-ink">
              {item.quantity}
            </Text>
            <Pressable
              onPress={handleIncrement}
              accessibilityLabel="Increase quantity"
              className="h-[30px] w-[30px] items-center justify-center active:opacity-60">
              <Icon name="plus" size={14} color={c.primary} />
            </Pressable>
          </View>

          {discount > 0 ? (
            <View className="items-end">
              <Text className="font-sans-bold text-base text-primary">
                ₹{discountedTotal.toFixed(2)}
              </Text>
              <Text className="text-xs text-muted line-through">₹{originalTotal.toFixed(2)}</Text>
              <Text className="font-sans-semibold text-[11px] text-success">{discount}% OFF</Text>
            </View>
          ) : (
            <Text className="font-sans-bold text-base text-ink">₹{originalTotal.toFixed(2)}</Text>
          )}
        </View>

        {onSaveForLater ? (
          <Pressable
            onPress={onSaveForLater}
            disabled={savingForLater}
            accessibilityRole="button"
            accessibilityLabel="Save for later"
            className="mt-2 flex-row items-center gap-1 self-start active:opacity-60"
            style={{ opacity: savingForLater ? 0.5 : 1 }}>
            <Icon name="bookmark" size={13} color={c.link} />
            <Text className="font-sans-semibold text-[12px] text-link">
              {savingForLater ? 'Saving…' : 'Save for later'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}