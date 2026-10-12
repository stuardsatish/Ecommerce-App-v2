import { Modal, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Ported from CartPage.jsx's `paymentModal` (lines ~541-671 of the source),
 * rendered as an RN Modal instead of a CSS overlay — same Modal-over-
 * Pressable-backdrop pattern FiltersSheet.jsx already established. Button
 * colors are the source's literal brand colors (Razorpay uses the app's
 * primary token, WhatsApp/COD are hardcoded hex, exactly as source hardcodes
 * them) rather than app theme tokens, since these represent third-party
 * payment-method branding, not this app's own design system.
 *
 * Icons match the source one-for-one: `CreditCard` (20) on Razorpay, the
 * inline WhatsApp logo SVG (20) — supplied here by Ionicons' `logo-whatsapp`,
 * since an RN component can't consume a raw SVG path without react-native-svg
 * — `Banknote` (20, #34D399) on COD, and `ArrowRight` (16) as every row's
 * trailing affordance, replacing the `→` text glyph.
 *
 * Icon colours use `inverse` so each glyph tracks the label beside it, which
 * is what the source's `text-inverse` on the button does. Note this leaves the
 * WhatsApp/COD rows low-contrast in dark mode (`inverse` inverts to near-black
 * while their brand backgrounds stay dark) — a source-side quirk that follows
 * from pinning those two backgrounds to brand hex, not a porting slip.
 */
export function PaymentMethodSheet({
  visible,
  onClose,
  paymentSettings,
  onSelectRazorpay,
  onSelectWhatsApp,
  onSelectCod,
}) {
  const c = useThemeColors();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-overlay" onPress={onClose} />
      <View className="gap-3 rounded-t-3xl bg-surface p-6">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="absolute right-4 top-4 z-10 active:opacity-60">
          <Icon name="x" size={20} color={c.muted} />
        </Pressable>

        <View className="mb-2 items-center gap-1 pt-2">
          <Text className="font-sans-bold text-xl text-ink">Choose Payment Method</Text>
          <Text className="font-sans-medium text-sm text-muted">
            Select how you would like to place your order.
          </Text>
        </View>

        {paymentSettings.razorpayPayment ? (
          <Pressable
            onPress={onSelectRazorpay}
            className="h-14 flex-row items-center justify-between rounded-xl bg-primary px-4 active:opacity-90"
            style={{
              // Source: `0px 4px 12px` of primary@20%.
              shadowColor: c.primary,
              shadowOpacity: 0.2,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            }}>
            <View className="flex-row items-center gap-3">
              <Icon name="credit-card" size={20} color={c.inverse} />
              <Text className="font-sans-bold text-[15px] text-inverse">Pay with Razorpay</Text>
            </View>
            <Icon name="arrow-right" size={16} color={c.inverse} />
          </Pressable>
        ) : null}

        {paymentSettings.whatsappPayment ? (
          <Pressable
            onPress={onSelectWhatsApp}
            className="h-14 flex-row items-center justify-between rounded-xl px-4 active:opacity-90"
            style={{
              backgroundColor: '#25D366',
              // Source: `0px 4px 12px rgba(37, 211, 102, 0.2)`.
              shadowColor: '#25D366',
              shadowOpacity: 0.2,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            }}>
            <View className="flex-row items-center gap-3">
              <Icon name="whatsapp" size={20} color={c.inverse} />
              <Text className="font-sans-bold text-[15px] text-inverse">Order via WhatsApp</Text>
            </View>
            <Icon name="arrow-right" size={16} color={c.inverse} />
          </Pressable>
        ) : null}

        {paymentSettings.codPayment ? (
          <Pressable
            onPress={onSelectCod}
            className="h-14 flex-row items-center justify-between rounded-xl px-4 active:opacity-90"
            style={{
              backgroundColor: '#1E293B',
              // Source: `0px 4px 12px rgba(30, 41, 59, 0.2)`.
              shadowColor: '#1E293B',
              shadowOpacity: 0.2,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            }}>
            <View className="flex-row items-center gap-3">
              <Icon name="banknote" size={20} color="#34D399" />
              <View>
                <Text className="font-sans-bold text-[15px] text-inverse">Cash on Delivery</Text>
                <Text className="text-[11px]" style={{ color: '#CBD5E1' }}>
                  Pay cash when your order arrives
                </Text>
              </View>
            </View>
            <Icon name="arrow-right" size={16} color={c.inverse} />
          </Pressable>
        ) : null}

        <Pressable onPress={onClose} className="mt-1 items-center py-2 active:opacity-60">
          <Text className="font-sans-semibold text-sm text-muted">Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}