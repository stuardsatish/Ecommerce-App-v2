import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';

import { AppHeader } from '@/components/AppHeader';
import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { nextAddQuantity, upsertCartItem } from '@/services/supabaseCart';
import { addCart } from '@/store/CartSlice';
import { generateAndShareInvoice } from '@/utils/invoice';
import { mapOrderRow, resolveOrderItemImage } from '@/utils/mappers';
import { orderNo, statusMeta } from '@/utils/orders';
import { paymentMethodLabel, paymentStatusLabel } from '@/utils/paymentLabels';

const cur = (n) => `₹${Number(n || 0).toFixed(2)}`;
// Order line-items store the per-unit charge as `finalPrice` (after
// discount); older/other shapes may use `price`/`originalPrice`. Same
// fallback chain as source, though `mapOrderRow` never sets the latter two
// (see utils/invoice.js's header note) — kept for forward-compatibility.
const unitPrice = (p) => Number(p?.finalPrice ?? p?.price ?? p?.originalPrice ?? 0);
const toJsDate = (v) => (v ? new Date(v) : null);
const formatAddress = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    return [v.street, v.city, v.state, v.pincode, v.country]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return '';
};
const fmtDate = (v) => {
  const d = toJsDate(v);
  return d && !isNaN(d.getTime())
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
};

/**
 * Ported from OrderDetailPage.jsx — the ONE order-related source page with
 * no isMobile split at all (a single responsive layout), confirmed by
 * re-reading the full file. That's why Buy Again lives here and not on the
 * list screen: it's the only order-related surface where mobile actually
 * has it.
 *
 * Unclear Item 8, resolved (fix): the source's `buyAgain` rebuilds each cart
 * item from `p.productId` ALONE, silently dropping `p.variantId` — a
 * confirmed data-loss bug, not a business rule. Fixed here: when the order
 * line has a `variantId`, the re-added cart item carries the same compound
 * id (`${productId}_${variantId}`) and variant fields every other add-to-
 * cart path in this app uses (Phases 9/10), so the original variant is
 * actually restored instead of silently falling back to the base product.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams();
  const dispatch = useDispatch();
  const c = useThemeColors();
  const user = useSelector((state) => state.user.user);
  const cartItems = useSelector((state) => state.cart.cartItems);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchOrder = async () => {
      setLoading(true);
      try {
        const { data: row, error: fetchError } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', id)
          .single();
        if (fetchError || !row) {
          if (active) setError(true);
          return;
        }
        const data = mapOrderRow(row);
        const productIds = [...new Set((data.products || []).map((item) => item.productId).filter(Boolean))];
        let productById = {};
        if (productIds.length) {
          const { data: pRows } = await supabase
            .from('products')
            .select('id, thumbnail, image, variants')
            .in('id', productIds);
          (pRows || []).forEach((p) => {
            productById[p.id] = p;
          });
        }
        const products = (data.products || []).map((item) => {
          const p = productById[item.productId];
          const img = resolveOrderItemImage(item, p);
          return img ? { ...item, thumbnail: img, image: img } : item;
        });
        if (active) setOrder({ ...data, products });
      } catch (err) {
        console.error('order detail fetch:', err);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchOrder();
    return () => {
      active = false;
    };
  }, [id]);

  const buyAgain = () => {
    (order?.products || []).forEach((p) => {
      const compoundId = p.variantId ? `${p.productId}_${p.variantId}` : p.productId;
      const item = {
        id: compoundId,
        productId: p.productId,
        variant_id: p.variantId || undefined,
        variant_name: p.variantName || undefined,
        title: p.title,
        price: unitPrice(p),
        image: p.thumbnail || p.image,
        thumbnail: p.thumbnail || p.image,
        category: p.category,
        stock: p.stock || 0,
      };
      const qty = nextAddQuantity(cartItems, compoundId);
      dispatch(addCart(item));
      upsertCartItem(user?.uid, item, qty);
    });
    toast.success('Items added to your cart'); // source: OrderDetailPage's buyAgain
    router.push('/cart');
  };

  const downloadInvoice = () => {
    generateAndShareInvoice(order, {
      name: order.userName || user?.name,
      email: order.userEmail || user?.email,
      phone: order.userPhone || user?.phone,
      address: order.address || order.shippingAddress,
    }).catch((err) => {
      console.error('Invoice generation failed:', err);
      Alert.alert('Could not generate invoice', 'Please try again.');
    });
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView className="flex-1">
          <AppHeader title="Order" />
          <View className="gap-4 p-6">
            <View className="h-7 w-60 rounded bg-border" />
            <View className="h-44 rounded-xl bg-border" />
            <View className="h-80 rounded-xl bg-border" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView className="flex-1">
          <AppHeader title="Order" />
          <View className="flex-1 items-center justify-center gap-4 px-6">
            {/* Source: `<Package size={44} style={{ color: "var(--color-border)" }}>`. */}
            <Icon name="package" size={44} color={c.border} />
            <Text className="font-sans-bold text-lg text-ink">Order not found</Text>
            <Pressable onPress={() => router.push('/orders')} className="rounded bg-primary px-7 py-3.5">
              <Text className="font-sans-semibold text-xs uppercase tracking-wide text-inverse">
                Back to Orders
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const m = statusMeta(order);
  const items = order.products || [];
  const computedItems = items.reduce((s, p) => s + unitPrice(p) * Number(p.quantity || 0), 0);
  const itemsTotal = order.subtotal != null ? Number(order.subtotal) : computedItems;
  const shipping = order.shipping != null ? Number(order.shipping) : Math.max(0, Number(order.total || 0) - itemsTotal);
  // See utils/invoice.js's header note: `mapOrderRow` never sets
  // taxableTotal/isInterState, so `hasGst` is always false on this app's
  // real data (confirmed identical on the web app's own OrderDetailPage) —
  // ported verbatim rather than removed, in case that ever changes.
  const hasGst = order.gstEnabled !== false && order.taxableTotal != null;
  const isInterState = !!order.isInterState;
  const totalCgst = Number(order.totalCgst || 0);
  const totalSgst = Number(order.totalSgst || 0);
  const totalIgst = Number(order.totalIgst || 0);

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1">
        <AppHeader title={`#${orderNo(order)}`} />
        <ScrollView contentContainerClassName="gap-4 px-5 py-4">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1 gap-1" style={{ minWidth: 0 }}>
              <Text className="font-sans-semibold text-xs uppercase tracking-wide text-body">
                Order ID
              </Text>
              <Text className="font-sans-bold text-2xl text-ink">#{orderNo(order)}</Text>
              <Text className="font-sans text-sm text-body">Placed on {fmtDate(order.createdAt)}</Text>
            </View>
            <View className={`flex-shrink-0 flex-row items-center gap-1.5 rounded-xl px-3 py-1.5 ${m.bg}`}>
              {/* Source dispatches on `m.icon` to Truck/CheckCircle2/XCircle at size 14. */}
              <Icon name={m.icon} size={14} color={c[m.tone]} />
              <Text className={`font-sans-semibold text-xs ${m.text}`}>{m.label}</Text>
            </View>
          </View>

          <View className="gap-3 rounded-xl border border-border bg-surface p-4">
            <Text className="font-sans-bold text-base text-ink">Items ({items.length})</Text>
            {items.map((p, i) => (
              <View
                key={i}
                className={`flex-row items-center gap-3 ${i === 0 ? '' : 'border-t border-info-subtle pt-3'}`}>
                {p.thumbnail || p.image ? (
                  <Image
                    source={{ uri: p.thumbnail || p.image }}
                    className="h-16 w-16 rounded-md bg-border"
                    contentFit="cover"
                    transition={150}
                    accessibilityLabel={p.title}
                  />
                ) : (
                  <View className="h-16 w-16 rounded-md bg-border" />
                )}
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text numberOfLines={1} className="font-sans-semibold text-[15px] text-ink">
                    {p.title}
                    {p.variantName ? ` · ${p.variantName}` : ''}
                  </Text>
                  <Text className="text-[13px] text-body">
                    Qty {p.quantity} · {cur(unitPrice(p))} each
                  </Text>
                </View>
                <Text className="font-sans-bold text-[15px] text-primary">
                  {cur(unitPrice(p) * Number(p.quantity || 0))}
                </Text>
              </View>
            ))}
          </View>

          <View className="gap-3 rounded-xl border border-border bg-surface p-4">
            <Text className="font-sans-bold text-base text-ink">Summary</Text>
            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="text-body">Items</Text>
                <Text className="font-sans-semibold text-ink">{cur(itemsTotal)}</Text>
              </View>
              {hasGst ? (
                isInterState ? (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-muted">Incl. IGST</Text>
                    <Text className="text-xs text-muted">{cur(totalIgst)}</Text>
                  </View>
                ) : (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-muted">Incl. CGST + SGST</Text>
                    <Text className="text-xs text-muted">{cur(totalCgst + totalSgst)}</Text>
                  </View>
                )
              ) : null}
              <View className="flex-row justify-between">
                <Text className="text-body">Shipping</Text>
                <Text className="font-sans-semibold text-ink">{shipping === 0 ? 'Free' : cur(shipping)}</Text>
              </View>
              <View className="flex-row justify-between border-t border-dashed border-border pt-2.5">
                <Text className="font-sans-bold text-ink">Total</Text>
                <Text className="font-sans-bold text-primary">{cur(order.total)}</Text>
              </View>
            </View>

            <View className="gap-2 pt-1">
              <Pressable
                onPress={buyAgain}
                className="h-12 flex-row items-center justify-center gap-1.5 rounded bg-accent-strong active:opacity-90">
                <Icon name="rotate-ccw" size={14} color={c.inverse} />
                <Text className="font-sans-semibold text-xs uppercase tracking-wide text-inverse">
                  Buy Again
                </Text>
              </Pressable>
              <Pressable
                onPress={downloadInvoice}
                className="h-12 flex-row items-center justify-center gap-1.5 rounded border border-border active:opacity-70">
                <Icon name="download" size={14} color={c.ink} />
                <Text className="font-sans-semibold text-xs uppercase tracking-wide text-ink">
                  Download Invoice
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="gap-3 rounded-xl border border-border bg-surface p-4">
            <Text className="font-sans-bold text-base text-ink">Delivery &amp; Payment</Text>
            <View className="gap-1">
              <Text className="font-sans-semibold text-xs uppercase tracking-wide text-body">Ship To</Text>
              <Text className="text-ink">{order.userName || user?.name || '—'}</Text>
              <Text className="text-body">
                {formatAddress(order.userAddress) ||
                  formatAddress(order.address) ||
                  formatAddress(order.shippingAddress) ||
                  'No address on file'}
              </Text>
            </View>
            <View className="gap-1">
              <Text className="font-sans-semibold text-xs uppercase tracking-wide text-body">Payment</Text>
              <Text className="text-ink">
                {order.paymentMethod ? paymentMethodLabel(order.paymentMethod) : '—'}
                {order.paymentStatus ? ` · ${paymentStatusLabel(order.paymentStatus, order.paymentMethod)}` : ''}
              </Text>
              {order.razorpayPaymentId ? (
                <Text className="text-body">{order.razorpayPaymentId}</Text>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}