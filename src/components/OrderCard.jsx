import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Stars } from '@/components/Stars';
import { useThemeColors } from '@/hooks/useThemeColors';
import { orderNo } from '@/utils/orders';
import { requestSummaryLine } from '@/utils/requestModel';
import { summarizeTracking, trackingHeadline } from '@/utils/shipmentModel';

/**
 * Ported from UserOrdersPage.jsx / UserPastOrdersPage.jsx's mobile card
 * (near-identical between the two source pages — this consolidates both
 * into one component, since the RN route tree has a single `orders/index`
 * screen rather than two separate pages, see that screen's header comment).
 * Fixes the mobile card's `$` → `₹` total display, same class of bug fixed
 * in Phases 8/12.
 *
 * "Buy Again" is intentionally NOT here — re-reading both source pages
 * confirmed their mobile layouts never render it (only the desktop
 * `UserOrderCard` does); the mobile source's only actions per order are
 * invoice download and, for delivered items, a review entry point. Buy Again
 * DOES exist on mobile via OrderDetailPage (no isMobile split there at all),
 * so it's ported on the RN order-detail screen instead, with Unclear Item
 * 8's variant-loss bug fixed there.
 *
 * `onPress` (tap the whole card → order detail) is a deliberate addition:
 * the source's mobile list cards have NO tap-through to `/order/:id` at
 * all — on web that page is still reachable by typing the URL directly, but
 * in this app there'd be no navigation path to it whatsoever, making the
 * entire Order Detail screen (and its Buy Again/GST breakdown) dead,
 * unreachable code. Adding the tap is pure navigation/discoverability, not
 * a business-logic change.
 */

/**
 * Badge appearance per status. The `className` half carries the source's
 * background/foreground token pair; `icon`/`iconColor` exist because
 * `@expo/vector-icons` takes a literal `color`, not a className, so the glyph
 * can't inherit `text-*` the way the source's `currentColor` SVG does.
 *
 * The source's two mobile pages hardcode their badge glyph rather than
 * deriving it: the Ongoing page always renders `Clock size={10}`, the Past
 * page always `CheckCircle2 size={10}` (it lists delivered only). Since this
 * one component covers both lists, the glyph is keyed off the status instead,
 * which reproduces both pages' output for every status they can actually show.
 * `cancelled` continues the RN-only superset noted on the orders screen.
 */
const STATUS_BADGES = {
  placed: { className: 'bg-accent-subtle text-accent-strong', icon: 'clock', tone: 'accentStrong' },
  confirmed: { className: 'bg-info-subtle text-info', icon: 'clock', tone: 'info' },
  shipped: { className: 'bg-accent-subtle text-accent-strong', icon: 'clock', tone: 'accentStrong' },
  delivered: {
    className: 'bg-success-subtle text-primary',
    icon: 'check-circle-2',
    tone: 'primary',
  },
  cancelled: { className: 'bg-error-subtle text-error', icon: 'x-circle', tone: 'error' },
};

const FALLBACK_BADGE = { className: 'bg-surface-muted text-body', icon: 'clock', tone: 'body' };

/**
 * `returnRequest` (optional): the customer's newest return / exchange request for this order - shown as one status line
 * ("Return · Approved"). A delivered order also carries a "Return / Exchange" link: both lead to the order screen, where the
 * requests live (Phase 6; the website's order cards do the same).
 */
export function OrderCard({ order, returnRequest = null, getReview, onDownloadInvoice, onReviewPress, onPress }) {
  const c = useThemeColors();
  const items = order.products || [];
  const badge = STATUS_BADGES[order.orderStatus] || FALLBACK_BADGE;

  return (
    <Pressable onPress={onPress} className="rounded-xl bg-surface p-4 shadow-card active:opacity-90">
      <View className="mb-3 flex-row items-center justify-between gap-2 border-b border-surface-muted pb-3">
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text className="font-sans-medium text-[10px] uppercase tracking-wide text-muted">
            Order
          </Text>
          <Text numberOfLines={1} className="font-sans-bold text-sm text-ink">
            #{orderNo(order)}
          </Text>
          {order.orderStatus === 'shipped' ? (
            <Text numberOfLines={1} className="text-[11px] text-info">
              {trackingHeadline(order)}
              {summarizeTracking(order).courierName ? ` · ${summarizeTracking(order).courierName}` : ''}
            </Text>
          ) : null}
          {returnRequest ? (
            <Text numberOfLines={1} className="font-sans-semibold text-[11px] text-info">
              {requestSummaryLine(returnRequest)}
            </Text>
          ) : null}
          {order.orderStatus === 'delivered' ? (
            <Pressable onPress={onPress} hitSlop={6} accessibilityRole="link" className="self-start active:opacity-60">
              <Text className="font-sans-bold text-[11px] text-link">Return / Exchange</Text>
            </Pressable>
          ) : null}
        </View>
        <View className="flex-shrink-0 flex-row items-center gap-2.5">
          <Text className="font-sans-bold text-base text-primary">₹{Number(order.total).toFixed(2)}</Text>
          <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${badge.className}`}>
            <Icon name={badge.icon} size={10} color={c[badge.tone]} />
            <Text className="font-sans-semibold text-[10px] capitalize">{order.orderStatus}</Text>
          </View>
          <Pressable
            onPress={onDownloadInvoice}
            accessibilityLabel="Download invoice"
            hitSlop={6}
            className="h-7 w-7 items-center justify-center rounded-lg bg-ink active:opacity-70">
            <Icon name="download" size={13} color={c.inverse} />
          </Pressable>
        </View>
      </View>

      <View className="gap-2.5">
        {items.map((item, index) => {
          const rev = getReview ? getReview(item.productId) : null;
          return (
            <View key={index} className="flex-row items-center justify-between gap-2.5">
              <View className="flex-1 flex-row items-center gap-2.5" style={{ minWidth: 0 }}>
                <View className="h-11 w-11 items-center justify-center rounded-lg bg-surface-muted p-1">
                  <Image
                    source={{ uri: item.thumbnail || item.image }}
                    className="h-full w-full rounded"
                    contentFit="cover"
                    transition={150}
                    accessibilityLabel={item.title}
                  />
                </View>
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text numberOfLines={1} className="font-sans-semibold text-[13px] text-ink">
                    {item.title}
                  </Text>
                  <Text className="text-[11px] text-muted">Qty: {item.quantity}</Text>
                </View>
              </View>

              {order.orderStatus === 'delivered' ? (
                rev ? (
                  <Pressable
                    onPress={() => onReviewPress?.(item)}
                    accessibilityLabel={`Edit your review of ${item.title}`}
                    className="flex-shrink-0 flex-row items-center gap-1 active:opacity-60">
                    {/* Source: five `Star size={10}` filled to `rev.rating` — an
                        already-rounded integer out of the reviews table, so no
                        further rounding (`round={false}`). */}
                    <Stars rating={rev.rating || 0} size={10} round={false} />
                    <Text className="font-sans-bold text-[10px] text-primary">(Edit)</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => onReviewPress?.(item)}
                    accessibilityLabel={`Review ${item.title}`}
                    className="flex-shrink-0 flex-row items-center gap-1 active:opacity-60">
                    <Icon name="star" size={12} color={c.primary} />
                    <Text className="font-sans-bold text-[11px] text-primary">Review</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}