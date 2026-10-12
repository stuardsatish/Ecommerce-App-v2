import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';

import { AddressPickerSheet } from '@/components/AddressPickerSheet';
import { AppHeader } from '@/components/AppHeader';
import { CartLineItem } from '@/components/CartLineItem';
import { DeliverToCard } from '@/components/DeliverToCard';
import { Icon } from '@/components/Icon';
import { PaymentMethodSheet } from '@/components/PaymentMethodSheet';
import { PolicyLinks } from '@/components/PolicyLinks';
import { ProductCard } from '@/components/ProductCard';
import { mapProductRow } from '@/utils/mappers';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { describeProfileAddress } from '@/services/addresses';
import { validatePromoCode } from '@/services/promo';
import { createCodOrder, createRazorpayOrder, openRazorpayCheckout, verifyRazorpayPayment } from '@/services/razorpay';
import {
  describeCoupon,
  listAvailableCoupons,
  listSavedItems,
  moveSavedToCart,
  removeSavedItem,
  saveForLater,
} from '@/services/savedItems';
import { clearCartItems, upsertCartItem } from '@/services/supabaseCart';
import { clearCart } from '@/store/CartSlice';
import { computeCartTotals, getPrice, getDiscount, isDiscountActive } from '@/utils/pricing';

const DEFAULT_SHIPPING_CONFIG = { freeShippingThreshold: 500, shippingCost: 49 };
const WHATSAPP_ORDER_NUMBER = '919940574522';

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

/**
 * Builds the {productId, variantId, variant_name, quantity} payload the
 * server's payment Edge Functions expect — ported verbatim from the
 * duplicated inline map in both CartPage.jsx's placeOrder and
 * handleCodOrder. The `_var_`-delimited fallback branch is dead for this
 * app's actual data: every RN cart item already carries `productId` (from
 * mapProductRow) and, for variant purchases, `variant_id` directly (set in
 * Phase 9's cartPayload), so the `||` short-circuits before that branch ever
 * evaluates. Kept verbatim rather than trimmed, since it's inert, not wrong.
 */
const buildOrderItems = (cartItems) =>
  cartItems.map((i) => {
    const rawId = String(i.id || i.compound_id || '');
    const cleanPid = i.productId || (rawId.includes('_var_') ? rawId.split('_var_')[0] : rawId);
    const cleanVid = i.variant_id || (rawId.includes('_var_') ? 'var_' + rawId.split('_var_')[1] : null);
    return {
      productId: cleanPid,
      variantId: cleanVid,
      variant_name: i.variant_name || null,
      quantity: i.quantity,
    };
  });

/**
 * One row in the "Saved for later" section (Phase 5.1). Shows the snapshot
 * price from save-time; moveSavedToCart re-fetches the live product before
 * moving. Move to cart / Remove actions.
 */
function SavedItemRow({ item, busy, onMoveToCart, onRemove, c }) {
  const discount =
    item.discount && item.discountExpiry && new Date(item.discountExpiry) > new Date()
      ? Number(item.discount)
      : 0;
  const price = Number(item.price || 0);
  const effectivePrice = price - (price * discount) / 100;

  return (
    <View
      className="flex-row gap-3 rounded-xl border border-border bg-surface p-3"
      style={{ opacity: busy ? 0.55 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
      <View className="h-16 w-16 rounded-lg bg-surface-muted" />
      <View className="flex-1 justify-between" style={{ minWidth: 0 }}>
        <Text numberOfLines={2} className="font-sans-semibold text-[13px] leading-[18px] text-ink">
          {item.title}
        </Text>
        {discount > 0 ? (
          <View className="mt-1 flex-row items-baseline gap-1.5">
            <Text className="font-sans-bold text-sm text-primary">
              {'\u20b9'}{effectivePrice.toFixed(2)}
            </Text>
            <Text className="text-xs text-muted line-through">
              {'\u20b9'}{price.toFixed(2)}
            </Text>
            <Text className="font-sans-semibold text-[10px] text-success">{discount}% OFF</Text>
          </View>
        ) : (
          <Text className="mt-1 font-sans-bold text-sm text-ink">
            {'\u20b9'}{effectivePrice.toFixed(2)}
          </Text>
        )}
        <View className="mt-2 flex-row gap-4">
          <Pressable
            onPress={onMoveToCart}
            disabled={busy}
            accessibilityRole="button"
            className="flex-row items-center gap-1 active:opacity-60">
            <Icon name="shopping-cart" size={13} color={c.primary} />
            <Text className="font-sans-semibold text-[12px] text-primary">Move to cart</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            disabled={busy}
            accessibilityRole="button"
            className="flex-row items-center gap-1 active:opacity-60">
            <Icon name="trash-2" size={13} color={c.error} />
            <Text className="font-sans-semibold text-[12px] text-error">Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Ported from CartPage.jsx's mobile layout (cart list, qty edit, clear cart,
 * bottom Total/checkout bar) plus, this phase, the full checkout flow
 * (placeOrder/handleCodOrder/sendOrderToWhatsApp/paymentModal — shared logic,
 * no isMobile branch in the source for any of it). TWO deliberate additions
 * from Phase 10 remain, both flagged there: a promo code input + Order
 * Summary breakdown (desktop-only in source, ported up because Phase 10's
 * spec required it to be testable), and a bottom-bar total that uses the
 * correct `computeCartTotals` pipeline instead of the mobile source's
 * discount-blind, `$`-labeled `total` bug.
 *
 * Razorpay note: `RazorpayCheckout.open()` (react-native-razorpay) is a
 * single Promise — success and every failure/cancellation path (the web
 * app's separate `modal.ondismiss` and `rzp.on("payment.failed")` handlers)
 * all collapse into this Promise's resolve/reject, so there's one catch
 * block here instead of three separate web callbacks. This is a native-SDK
 * shape difference, not a behavior change: every path still stops
 * `isProcessing` and surfaces a message.
 */
export default function CartScreen() {
  const dispatch = useDispatch();
  const c = useThemeColors();
  const cartItems = useSelector((state) => state.cart.cartItems);
  const user = useSelector((state) => state.user.user);

  const [paymentSettings, setPaymentSettings] = useState({
    whatsappPayment: true,
    razorpayPayment: true,
    codPayment: true,
  });
  const [shippingConfig, setShippingConfig] = useState(DEFAULT_SHIPPING_CONFIG);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // `key` changes on every opening so the sheet's view and form start fresh.
  const [addressPicker, setAddressPicker] = useState({ visible: false, startInForm: false, key: 0 });

  // ── Phase 5A: Save for later ──────────────────────────────────────────────
  const savedItems = useSelector((state) => state.savedItems?.items || []);
  const [savingId, setSavingId] = useState(null); // cart item id being saved
  const [movingId, setMovingId] = useState(null); // saved item id being moved
  const [removingId, setRemovingId] = useState(null);

  // ── Phase 5A: Coupons ─────────────────────────────────────────────────────
  const [coupons, setCoupons] = useState([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [showCoupons, setShowCoupons] = useState(false);

  // ── Phase 5A: Price-change notice ─────────────────────────────────────────
  // Maps compound_id → { storedPrice, livePrice, liveDiscount, liveExpiry }
  const [priceChanges, setPriceChanges] = useState({});
  const [acknowledgedChanges, setAcknowledgedChanges] = useState(false);
  const hasAnyPriceChange = Object.keys(priceChanges).length > 0 && !acknowledgedChanges;

  // ── Phase 5B: Cross-sell shelf ────────────────────────────────────────────
  const [crossSell, setCrossSell] = useState([]);
  const [crossSellLoaded, setCrossSellLoaded] = useState(false);

  // ── Phase 5B: Gift wrap (5.10) ──────────────────────────────────
  const [giftWrap, setGiftWrap] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');

  const openAddressPicker = (startInForm) =>
    setAddressPicker((s) => ({ visible: true, startInForm, key: s.key + 1 }));
  // The default address — what checkout, COD and invoices all read.
  const deliverTo = describeProfileAddress(user?.address, user);

  useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('settings')
          .select('id, data')
          .in('id', ['paymentSettings', 'shippingSettings']);
        if (error) throw error;
        const byId = {};
        (rows || []).forEach((r) => {
          byId[r.id] = r.data || {};
        });
        if (!active) return;
        const pd = byId.paymentSettings;
        if (pd) {
          // COD defaults to enabled for rows created before the flag existed.
          setPaymentSettings({ ...pd, codPayment: pd.codPayment !== false });
        }
        const sd = byId.shippingSettings;
        if (sd) {
          setShippingConfig({
            freeShippingThreshold:
              typeof sd.freeShippingThreshold === 'number' ? sd.freeShippingThreshold : 500,
            shippingCost: typeof sd.shippingCost === 'number' ? sd.shippingCost : 49,
          });
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      }
    };
    fetchSettings();
    return () => {
      active = false;
    };
  }, []);

  // Load saved items and coupons once on mount (graceful-degradation handled inside).
  useEffect(() => {
    listSavedItems().catch(() => {});
    listAvailableCoupons()
      .then((list) => { setCoupons(list); setCouponsLoaded(true); })
      .catch(() => setCouponsLoaded(true));
  }, []);

  // Price-change detection: compare each cart item's stored price/discount
  // against the live product row. Only runs once per cart load.
  useEffect(() => {
    if (!cartItems.length) return;
    let active = true;
    const productIds = [...new Set(cartItems.map((i) => i.productId || String(i.id || '').split('_var_')[0]).filter(Boolean))];
    supabase
      .from('products')
      .select('id,price,discount,discount_expiry')
      .in('id', productIds)
      .then(({ data }) => {
        if (!active || !data) return;
        const byId = {};
        data.forEach((p) => { byId[p.id] = p; });
        const changes = {};
        cartItems.forEach((item) => {
          const pid = item.productId || String(item.id || '').split('_var_')[0];
          const live = byId[pid];
          if (!live) return;
          const livePrice = getPrice(live);
          const storedDiscount = isDiscountActive(item) ? Number(item.discount || 0) : 0;
          const storedPrice = Number(item.price || 0) - (Number(item.price || 0) * storedDiscount) / 100;
          // Flag if the live effective price differs by more than 1 rupee (float safety).
          if (Math.abs(livePrice - storedPrice) > 1) {
            const key = String(item.compound_id || item.id);
            changes[key] = {
              storedPrice,
              livePrice,
              liveDiscount: live.discount || 0,
              liveExpiry: live.discount_expiry || null,
            };
          }
        });
        setPriceChanges(changes);
      })
      .catch(() => {}); // graceful: missing live data = no notice
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount; cart items are stable from the DB load

  // Cross-sell: fetch top-rated products not already in cart.
  useEffect(() => {
    let active = true;
    supabase
      .from('products')
      .select('*')
      .order('rating', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!active || !data) return;
        const cartIds = new Set(cartItems.map((i) => String(i.productId || i.id)));
        const filtered = data
          .map((row) => {
            try { return mapProductRow(row); } catch { return null; }
          })
          .filter((p) => p && !cartIds.has(String(p.id)))
          .slice(0, 8);
        setCrossSell(filtered);
        setCrossSellLoaded(true);
      })
      .catch(() => setCrossSellLoaded(true));
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCheckoutDisabled =
    !paymentSettings.whatsappPayment &&
    !paymentSettings.razorpayPayment &&
    !paymentSettings.codPayment;

  const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const { subtotal, subtotalRounded, promoDiscount, shippingEstimate, orderTotal } = useMemo(
    () => computeCartTotals(cartItems, { appliedPromo, shippingConfig }),
    [cartItems, appliedPromo, shippingConfig]
  );

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setApplyingPromo(true);
    try {
      // Validated server-side (promo_codes is not client-readable). The
      // authoritative discount is recomputed again at actual checkout.
      const data = await validatePromoCode(code, subtotal);
      setAppliedPromo({
        code: data.code || code,
        type: data.type || 'percent',
        value: Number(data.value || 0),
      });
      toast.success(
        data.discount > 0 ? `Promo applied: -${money(data.discount)}` : 'Promo applied'
      );
    } catch (err) {
      setAppliedPromo(null);
      toast.error(err.message || 'Could not apply promo code');
    } finally {
      setApplyingPromo(false);
    }
  };

  const handleClearCart = () => {
    dispatch(clearCart());
    clearCartItems(user?.uid);
  };

  // ── Phase 5A: Save for later handlers ─────────────────────────────────────
  const handleSaveForLater = async (cartItem) => {
    const key = String(cartItem.compound_id || cartItem.id);
    setSavingId(key);
    try {
      await saveForLater(cartItem);
      toast.success(`${cartItem.title || 'Item'} saved for later`);
    } catch (err) {
      toast.error(err.message || 'Could not save for later.');
    } finally {
      setSavingId(null);
    }
  };

  const handleMoveSavedToCart = async (savedItem) => {
    const key = String(savedItem.compound_id || savedItem.id);
    setMovingId(key);
    try {
      const result = await moveSavedToCart(savedItem);
      if (result.clamped) {
        toast.info(`Only ${result.clampedTo} left in stock — quantity adjusted.`);
      } else {
        toast.success(`${savedItem.title || 'Item'} moved to cart`);
      }
    } catch (err) {
      toast.error(err.message || 'Could not move to cart.');
    } finally {
      setMovingId(null);
    }
  };

  const handleRemoveSaved = async (savedItem) => {
    const key = String(savedItem.compound_id || savedItem.id);
    setRemovingId(key);
    try {
      await removeSavedItem(savedItem);
    } catch (err) {
      toast.error(err.message || 'Could not remove.');
    } finally {
      setRemovingId(null);
    }
  };

  // ── Phase 5A: Coupon apply from list ─────────────────────────────────────
  const handleApplyCouponFromList = (coupon) => {
    setPromoCode(coupon.code);
    setShowCoupons(false);
    // Trigger the existing promo-validate flow
    setTimeout(() => handleApplyPromo(), 0);
  };

  // ── Phase 5A: Price-change acknowledge ────────────────────────────────────
  const handleAcknowledgePriceChanges = async () => {
    // Write the live values back to cart_items so the totals are fresh.
    const uid = user?.uid;
    if (uid) {
      await Promise.all(
        cartItems
          .filter((item) => priceChanges[String(item.compound_id || item.id)])
          .map((item) => {
            const ch = priceChanges[String(item.compound_id || item.id)];
            return upsertCartItem(
              uid,
              {
                productId: item.productId || String(item.id || '').split('_var_')[0],
                variantId: item.variant_id,
                variant_name: item.variant_name,
                selected_variant: item.selected_variant,
                title: item.title,
                image: item.image,
                category: item.category,
                price: item.price, // MRP unchanged; effective price = price - (price * discount / 100)
                discount: ch.liveDiscount,
                discountExpiry: ch.liveExpiry,
              },
              item.quantity
            );
          })
      ).catch(() => {});
    }
    setAcknowledgedChanges(true);
    setPriceChanges({});
  };

  /** Shared by placeOrder/handleCodOrder — mirrors the source's duplicated check. */
  const requireVerifiedEmail = async () => {
    const { data: freshAuth } = await supabase.auth.getUser();
    if (freshAuth?.user?.email_confirmed_at) return true;
    try {
      await supabase.auth.resend({ type: 'signup', email: user.email });
    } catch (err) {
      console.log('verify email send:', err);
    }
    // Blocking dialog rather than a toast: this stops checkout, and the
    // message ("we just sent you a verification link") needs to be read,
    // not glanced at as it fades.
    Alert.alert(
      'Email verification required',
      'Please verify your email before checking out — we just sent you a verification link.'
    );
    return false;
  };

  const placeOrder = async () => {
    if (!user?.uid) {
      toast.error('Please login first');
      return;
    }
    if (!(await requireVerifiedEmail())) return;

    setIsProcessing(true);
    try {
      // Server validates each item against the catalog and computes the
      // amount; promoCode is sent as a plain string, resolved server-side —
      // the client never determines the value.
      const rzpOrder = await createRazorpayOrder({
        items: buildOrderItems(cartItems),
        promoCode: appliedPromo ? appliedPromo.code : '',
      });

      const paymentData = await openRazorpayCheckout({
        key: rzpOrder.keyId,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        order_id: rzpOrder.orderId,
        name: 'Nexus Commerce',
        description: `Order • ${totalItems} item(s)`,
        prefill: {
          name: user.name || '',
          email: user.email || '',
          contact: user.phone || '',
        },
        theme: { color: c.primary },
      });

      // Server verifies the signature AND writes the order from its own
      // validated copy — the client can't influence price or contents here.
      const verifyData = await verifyRazorpayPayment({
        razorpay_order_id: paymentData.razorpay_order_id,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      });

      // Attach gift wrap info to the order row (safe: these columns default
      // to false/'' so a failed update doesn't affect the order itself).
      if (verifyData?.orderId && (giftWrap || giftMessage.trim())) {
        supabase
          .from('orders')
          .update({ gift_wrap: giftWrap, gift_message: giftMessage.trim() })
          .eq('id', verifyData.orderId)
          .then(() => {})
          .catch(() => {});
      }

      dispatch(clearCart());
      toast.success('Payment successful — order placed');
      router.push('/products');
    } catch (error) {
      console.error('ORDER ERROR:', error);
      toast.error(
        error?.description || error?.message || 'Payment could not be completed.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCodOrder = async () => {
    setShowPaymentSheet(false);
    if (!user?.uid) {
      toast.error('Please login first to place an order');
      return;
    }
    if (!(await requireVerifiedEmail())) return;

    // Address must be on file before COD (server rejects otherwise).
    const addr = user.address;
    const street = typeof addr === 'object' ? addr?.street : addr;
    if (!street || !String(street).trim()) {
      toast.error('Please add a delivery address before selecting Cash on Delivery.');
      openAddressPicker(true);
      return;
    }

    setIsProcessing(true);
    try {
      const codData = await createCodOrder({
        items: buildOrderItems(cartItems),
        promoCode: appliedPromo ? appliedPromo.code : '',
      });
      // Attach gift wrap info
      if (codData?.orderId && (giftWrap || giftMessage.trim())) {
        supabase
          .from('orders')
          .update({ gift_wrap: giftWrap, gift_message: giftMessage.trim() })
          .eq('id', codData.orderId)
          .then(() => {})
          .catch(() => {});
      }
      dispatch(clearCart());
      toast.success('Order placed successfully with Cash on Delivery!');
      router.push('/orders');
    } catch (err) {
      console.error('COD Order Error:', err);
      toast.error(err.message || 'Could not place order.');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendOrderToWhatsApp = async () => {
    setShowPaymentSheet(false);
    try {
      const customerName = user?.name || '';
      const customerEmail = user?.email || '';
      const customerPhone = user?.phone || 'NA';
      const customerID = user?.uid || '';

      let itemsStr = '';
      cartItems.forEach((item, index) => {
        const mrp = Number(item.price || 0);
        const discount = isDiscountActive(item) ? Number(item.discount || 0) : 0;
        const discountedPrice = Number((mrp - (mrp * discount) / 100).toFixed(2));
        const variantLabel = item.variant_name ? ` [${item.variant_name}]` : '';
        if (discount > 0) {
          itemsStr += `${index + 1}. ${item.title}${variantLabel}\n Quantity: ${item.quantity}\n MRP: ${money(mrp)}\n Discount: ${discount}%\n Discounted Price: ${money(discountedPrice)}\n\n`;
        } else {
          itemsStr += `${index + 1}. ${item.title}${variantLabel}\n Quantity: ${item.quantity}\n MRP: ${money(mrp)}\n Discounted Price: ${money(mrp)}\n\n`;
        }
      });

      const promoLine =
        promoDiscount > 0
          ? `Promo Code : ${appliedPromo?.code || 'Applied'}\nPromo Discount : ${money(promoDiscount)}\n`
          : '';

      const message = `Hello,

I would like to place the following order.

**Customer Details:**

Customer ID: ${customerID}
Customer Name: ${customerName}
Email: ${customerEmail}
Phone: ${customerPhone}


**Items:**

${itemsStr}
Total Items : ${totalItems}
Subtotal : ${money(subtotalRounded)}
Shipping : ${money(shippingEstimate)}
${promoLine}Total Amount : ${money(orderTotal)}

Thank you.`;

      const url = `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(message)}`;
      await Linking.openURL(url);
    } catch (error) {
      console.error('WhatsApp order failed:', error);
      toast.error('Failed to generate WhatsApp order. Please try again.');
    }
  };

  const handleCheckout = () => setShowPaymentSheet(true);

  if (cartItems.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
          <AppHeader title="Cart" />
          <FlatList
            data={savedItems}
            keyExtractor={(item) => String(item.compound_id || item.id)}
            contentContainerClassName="gap-3 px-5 py-4"
            ListHeaderComponent={
              <View className="flex-1 items-center justify-center gap-4 py-10">
                <Icon name="shopping-bag" size={44} color={c.borderStrong} />
                <Text className="font-sans-semibold text-sm text-muted">Your cart is empty.</Text>
                <Pressable
                  onPress={() => router.push('/products')}
                  className="rounded-full bg-primary px-6 py-3 active:opacity-80">
                  <Text className="font-sans-bold text-sm text-inverse">Discover Products</Text>
                </Pressable>
                {savedItems.length > 0 ? (
                  <Text className="font-sans-bold text-base text-ink">
                    Saved for later ({savedItems.length})
                  </Text>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <SavedItemRow
                item={item}
                busy={movingId === String(item.compound_id || item.id) || removingId === String(item.compound_id || item.id)}
                onMoveToCart={() => handleMoveSavedToCart(item)}
                onRemove={() => handleRemoveSaved(item)}
                c={c}
              />
            )}
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <AppHeader title="Cart" />
        <FlatList
          className="flex-1"
          data={cartItems}
          keyExtractor={(item) => String(item.id || item.compound_id)}
          contentContainerClassName="gap-3 px-5 pb-6 pt-4"
          renderItem={({ item }) => (
            <View>
              {/* Price-change notice per line */}
              {priceChanges[String(item.compound_id || item.id)] && !acknowledgedChanges ? (
                <View className="mb-1 flex-row items-center gap-1.5 rounded-lg bg-warning-subtle px-3 py-1.5">
                  <Icon name="alert-triangle" size={12} color={c.warning} />
                  <Text className="flex-1 text-[11px] text-warning" numberOfLines={2}>
                    Price {priceChanges[String(item.compound_id || item.id)].livePrice > priceChanges[String(item.compound_id || item.id)].storedPrice ? 'increased' : 'dropped'} from
                    {' '}₹{priceChanges[String(item.compound_id || item.id)].storedPrice.toFixed(0)} to
                    {' '}₹{priceChanges[String(item.compound_id || item.id)].livePrice.toFixed(0)}
                  </Text>
                </View>
              ) : null}
              <CartLineItem
                item={item}
                onSaveForLater={() => handleSaveForLater(item)}
                savingForLater={savingId === String(item.compound_id || item.id)}
              />
            </View>
          )}
          ListHeaderComponent={
            <View className="gap-3">
              <Text className="font-sans-bold text-3xl text-ink">Cart</Text>
              {/* Phase 8.3: guest upgrade banner */}
              {user?.is_anonymous && (
                <View className="flex-row items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-sans-semibold text-[13px] text-primary">Shopping as Guest</Text>
                    <Text className="text-xs text-body">Create an account to save your order history.</Text>
                  </View>
                  <Pressable
                    onPress={() => router.push('/signup')}
                    className="shrink-0 rounded-full border border-primary px-4 py-1.5 active:opacity-70">
                    <Text className="font-sans-bold text-[12px] text-primary">Sign up</Text>
                  </Pressable>
                </View>
              )}
            </View>
          }
          ListFooterComponent={
            <View className="gap-4 pt-2">
              {/* ── Price-change summary banner ─────────────────────── */}
              {hasAnyPriceChange ? (
                <View className="flex-row items-center gap-3 rounded-xl border border-warning-border bg-warning-subtle p-3">
                  <Icon name="alert-triangle" size={16} color={c.warning} />
                  <View className="flex-1">
                    <Text className="font-sans-semibold text-[13px] text-ink">
                      {Object.keys(priceChanges).length === 1 ? '1 item price has changed' : `${Object.keys(priceChanges).length} items have new prices`}
                    </Text>
                    <Text className="text-xs text-muted">Totals above reflect the latest prices.</Text>
                  </View>
                  <Pressable
                    onPress={handleAcknowledgePriceChanges}
                    className="rounded-lg bg-warning px-3 py-1.5 active:opacity-80">
                    <Text className="font-sans-bold text-xs text-inverse">Got it</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                onPress={handleClearCart}
                className="h-11 flex-row items-center justify-center gap-2 rounded-full border border-border active:opacity-70">
                <Icon name="trash-2" size={14} color={c.muted} />
                <Text className="font-sans-semibold text-[13px] text-muted">Clear Cart</Text>
              </Pressable>

              <DeliverToCard
                address={deliverTo}
                onChange={() => openAddressPicker(false)}
                onAdd={() => openAddressPicker(true)}
              />

              <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
                <Text className="font-sans-semibold text-sm text-ink">Order Summary</Text>
                <View className="gap-2 border-t border-border pt-3">
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-body">Subtotal</Text>
                    <Text className="font-sans-bold text-sm text-ink">{money(subtotalRounded)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-body">Shipping Estimate</Text>
                    <Text className="font-sans-bold text-sm text-ink">
                      {money(shippingEstimate)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-body">Tax</Text>
                    <Text className="text-xs text-muted">Included in price (GST)</Text>
                  </View>
                  {promoDiscount > 0 ? (
                    <View className="flex-row justify-between">
                      <Text className="text-sm text-body">Promo Discount</Text>
                      <Text className="font-sans-bold text-sm text-success">
                        -{money(promoDiscount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View className="flex-row justify-between border-t border-dashed border-border pt-3">
                  <Text className="font-sans-bold text-sm text-ink">Order Total</Text>
                  <Text className="font-sans-bold text-base text-primary">{money(orderTotal)}</Text>
                </View>
              </View>

              {/* ── Coupon UI (Phase 5.4) ─────────────────────────────── */}
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans-semibold text-xs uppercase tracking-wide text-muted">
                    Promo Code
                  </Text>
                  {couponsLoaded && coupons.length > 0 ? (
                    <Pressable
                      onPress={() => setShowCoupons((v) => !v)}
                      className="active:opacity-60">
                      <Text className="text-xs text-link">View available coupons</Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* Available coupons list */}
                {showCoupons && coupons.length > 0 ? (
                  <View className="gap-1.5 rounded-xl border border-border bg-surface p-3">
                    {coupons.map((coupon) => (
                      <View
                        key={coupon.code}
                        className="flex-row items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2">
                        <View className="flex-1">
                          <Text className="font-sans-bold text-[13px] text-primary">{coupon.code}</Text>
                          <Text className="text-xs text-muted">{describeCoupon(coupon)}</Text>
                        </View>
                        {appliedPromo?.code === coupon.code ? (
                          <View className="flex-row items-center gap-1">
                            <Icon name="check" size={12} color={c.success} />
                            <Text className="font-sans-semibold text-xs text-success">Applied</Text>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => handleApplyCouponFromList(coupon)}
                            className="rounded-lg bg-primary px-3 py-1.5 active:opacity-80">
                            <Text className="font-sans-bold text-xs text-inverse">Apply</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                ) : null}

                <View className="flex-row gap-2">
                  <TextInput
                    value={promoCode}
                    onChangeText={setPromoCode}
                    placeholder="Enter code"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholderTextColor={c.muted}
                    className="h-11 flex-1 rounded-xl border border-border bg-surface-muted px-3 font-sans text-sm text-ink"
                  />
                  <Pressable
                    onPress={handleApplyPromo}
                    disabled={applyingPromo}
                    className="h-11 items-center justify-center rounded-xl bg-body px-5 active:opacity-80">
                    <Text className="font-sans-bold text-sm text-inverse">
                      {applyingPromo ? '...' : 'Apply'}
                    </Text>
                  </Pressable>
                </View>
                {appliedPromo ? (
                  <View className="flex-row items-center gap-1.5">
                    <Icon name="check" size={13} color={c.success} />
                    <Text className="text-xs text-success">Applied: {appliedPromo.code}</Text>
                  </View>
                ) : null}
              </View>

              {/* ── Saved for later section ──────────────────────────── */}
              {savedItems.length > 0 ? (
                <View className="gap-2">
                  <Text className="font-sans-bold text-base text-ink">
                    Saved for later ({savedItems.length})
                  </Text>
                  {savedItems.map((item) => (
                    <SavedItemRow
                      key={String(item.compound_id || item.id)}
                      item={item}
                      busy={movingId === String(item.compound_id || item.id) || removingId === String(item.compound_id || item.id)}
                      onMoveToCart={() => handleMoveSavedToCart(item)}
                      onRemove={() => handleRemoveSaved(item)}
                      c={c}
                    />
                  ))}
                </View>
              ) : null}

              {/* ── Gift wrap (Phase 5.10) ────────────────────────────── */}
              <View
                className="rounded-2xl border border-border bg-surface p-4"
                style={{ gap: 12 }}>
                <View className="flex-row items-center justify-between">
                  <View style={{ flex: 1 }}>
                    <Text className="font-sans-bold text-sm text-ink">🎁 Gift wrap this order</Text>
                    <Text className="text-[11px] text-muted mt-0.5">We'll wrap your items beautifully</Text>
                  </View>
                  <Pressable
                    onPress={() => setGiftWrap((v) => !v)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: giftWrap }}
                    style={{
                      width: 46,
                      height: 26,
                      borderRadius: 13,
                      background: giftWrap ? c.primary : c.surfaceMuted,
                      backgroundColor: giftWrap ? c.primary : c.surfaceMuted,
                      justifyContent: 'center',
                      paddingHorizontal: 3,
                    }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: '#fff',
                        transform: [{ translateX: giftWrap ? 20 : 0 }],
                      }}
                    />
                  </Pressable>
                </View>
                {giftWrap ? (
                  <View>
                    <TextInput
                      value={giftMessage}
                      onChangeText={setGiftMessage}
                      placeholder="Add a personal message (optional)"
                      placeholderTextColor={c.muted}
                      multiline
                      numberOfLines={3}
                      maxLength={200}
                      className="rounded-xl border border-border bg-surface-muted px-3 py-2 font-sans text-sm text-ink"
                      style={{ minHeight: 72, textAlignVertical: 'top' }}
                    />
                    <Text className="mt-1 text-right text-[10px] text-muted">
                      {giftMessage.length}/200
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* ── Cross-sell shelf (Phase 5.6) ──────────────────────── */}
              {crossSellLoaded && crossSell.length > 0 ? (
                <View className="gap-2">
                  <Text className="font-sans-bold text-base text-ink">You may also like</Text>
                  <FlatList
                    data={crossSell}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(p) => String(p.id)}
                    contentContainerStyle={{ gap: 10 }}
                    renderItem={({ item: p }) => (
                      <View style={{ width: 140 }}>
                        <ProductCard product={p} />
                      </View>
                    )}
                  />
                </View>
              ) : null}

              {/* Roadmap task 1.16 — the delivery/returns terms reachable from
                  checkout, where the shipping estimate above prompts the
                  question. */}
              <PolicyLinks />
            </View>
          }
        />

        <View
          className="flex-row items-center justify-between gap-4 border-t border-border bg-surface px-5 py-4"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -4 },
            elevation: 8,
          }}>
          <View>
            <Text className="text-[11px] text-muted">Total ({totalItems})</Text>
            <Text className="font-sans-bold text-xl text-primary">{money(orderTotal)}</Text>
          </View>
          {isCheckoutDisabled ? (
            <View className="max-w-[210px] flex-1 rounded-2xl border border-error-border bg-error-subtle p-2.5">
              <Text className="text-center text-[10px] font-sans-bold leading-tight text-error">
                No payment methods available. Please contact administrator.
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={handleCheckout}
              disabled={isProcessing}
              className="h-12 max-w-[210px] flex-1 items-center justify-center rounded-full bg-primary"
              style={{
                // Source: `0px 10px 15px -3px`/`0px 4px 6px -4px` of primary@20%
                // (CartPage.jsx mobile branch) — same spec as [id].jsx's Buy Now.
                shadowColor: c.primary,
                shadowOpacity: 0.2,
                shadowRadius: 15,
                shadowOffset: { width: 0, height: 10 },
                elevation: 6,
                opacity: isProcessing ? 0.6 : 1,
              }}>
              <Text className="font-sans-bold text-base text-inverse">
                {isProcessing ? 'Processing…' : 'Place Order'}
              </Text>
            </Pressable>
          )}
        </View>

        {isProcessing ? (
          <View className="absolute inset-0 items-center justify-center bg-overlay px-6">
            <View className="max-w-[320px] items-center gap-2 rounded-3xl bg-surface p-10">
              {/*
                Source uses `<Package size={56} className="text-inverse">` — inverse
                because its overlay card is a translucent dark glass panel. This card
                is an opaque `bg-surface`, so the glyph takes `ink` to stay legible.
              */}
              <Icon name="package" size={56} color={c.ink} />
              <Text className="text-center font-sans-bold text-lg text-ink">
                Placing your order…
              </Text>
              <Text className="text-center text-sm text-body">Please wait for confirmation</Text>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      <PaymentMethodSheet
        visible={showPaymentSheet}
        onClose={() => setShowPaymentSheet(false)}
        paymentSettings={paymentSettings}
        onSelectRazorpay={() => {
          setShowPaymentSheet(false);
          placeOrder();
        }}
        onSelectWhatsApp={sendOrderToWhatsApp}
        onSelectCod={handleCodOrder}
      />

      <AddressPickerSheet
        key={addressPicker.key}
        visible={addressPicker.visible}
        startInForm={addressPicker.startInForm}
        onClose={() => setAddressPicker((s) => ({ ...s, visible: false }))}
      />
    </View>
  );
}