import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { LegalScreen } from '@/components/LegalScreen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getInvoiceSettings } from '@/services/settingsService';

/**
 * Help Center / FAQ (roadmap task 1.14).
 *
 * Every answer below describes what this app can ACTUALLY do today, not what
 * a generic storefront FAQ would claim. Two deliberate consequences:
 *   - Cancellation says "contact us", because no self-service cancel exists
 *     (roadmap Phase 6 would add it; the same honesty fix was already applied
 *     to the web Refund Policy copy).
 *   - Payment methods are listed as the three the app really supports
 *     (Razorpay / COD / WhatsApp-assisted), each of which the admin can still
 *     switch off via `paymentSettings` — hence "where enabled".
 *
 * Support email/phone are read from the admin-configurable `invoiceSettings`
 * row (same source as the invoice branding and the web Contact page) rather
 * than hardcoded, so they stay correct per white-label deployment.
 */

const FaqItem = ({ question, answer, isOpen, onToggle }) => {
  const c = useThemeColors();
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-surface">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="flex-row items-center justify-between gap-3 p-4 active:bg-surface-muted">
        <Text className="flex-1 font-sans-semibold text-sm text-ink">{question}</Text>
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
      </Pressable>
      {isOpen ? (
        <View className="border-t border-border px-4 pb-4 pt-3">
          <Text className="font-sans text-[14px] leading-[21px] text-body">{answer}</Text>
        </View>
      ) : null}
    </View>
  );
};

const FAQS = [
  {
    q: 'How do I track my order?',
    a: "Open My Orders from your profile menu. Each order shows its current status as it moves through confirmed, shipped, and delivered. Completed orders move to Past Orders, where you can also download the invoice.",
  },
  {
    q: 'What payment methods can I use?',
    a: 'Cards, UPI, and netbanking through Razorpay, plus Cash on Delivery and WhatsApp-assisted ordering where enabled. The final amount is always calculated on our server, so the total you confirm at checkout is the total you pay.',
  },
  {
    q: 'How much is delivery, and how long does it take?',
    a: 'Orders above the free-shipping threshold ship free; below it a flat charge applies, and either way the exact amount is shown at checkout before you pay. Orders are usually handed to our delivery partner within 1–2 business days, then take a further 2–5 business days to arrive. See the Delivery Policy for the current rates.',
  },
  {
    q: 'Can I cancel an order?',
    a: "There's no self-service cancel button yet. If your order hasn't shipped, contact us with your order number as soon as possible and we'll cancel it for you. Once it has shipped it can't be cancelled, but you can request a return after it arrives.",
  },
  {
    q: 'How do returns and refunds work?',
    a: "If something arrives damaged, incorrect, or not as described, contact us within the return window shown on the product page, with your order number, and we'll arrange a replacement or refund. Approved refunds on online payments go back to the original payment method via Razorpay, typically within 5–7 business days. See the Return Policy for full details.",
  },
  {
    q: 'Why can’t I review a product?',
    a: 'Reviews are limited to items you’ve actually bought and received — we check your order history before accepting one. That’s why every review on a product page carries a "Verified Purchase" badge.',
  },
  {
    q: 'How do I use a promo code?',
    a: 'Enter it in the cart before checking out. The discount is validated on our server against the code’s rules (minimum order value, expiry, usage limits), and the updated total shows immediately if it applies.',
  },
  {
    q: 'An item is out of stock. Can I be notified?',
    a: 'Yes — save it to your Wishlist, then tap "Notify Me" on the wishlist card. We record your interest against that item so you can be alerted when it comes back in stock.',
  },
  {
    q: 'How do I change my details or password?',
    a: 'Go to Profile. The pencil icon edits your name, gender, date of birth, phone, and delivery address; "Change" next to Password updates your password. Your email address is fixed to the one you signed up with.',
  },
];

export default function FaqScreen() {
  const c = useThemeColors();
  const [openIndex, setOpenIndex] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let active = true;
    getInvoiceSettings()
      .then((data) => active && setSettings(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const supportEmail = settings?.supportEmail || settings?.email || '';
  const supportPhone = settings?.supportPhone || settings?.mobile || '';

  return (
    <LegalScreen title="Help Center" lastUpdated="October 2026">
      <Text className="font-sans text-[15px] leading-6 text-body">
        Answers to the questions we get asked most. If yours isn&apos;t here, reach out using the
        contact details at the bottom of this page.
      </Text>

      <View className="gap-2.5">
        {FAQS.map((item, i) => (
          <FaqItem
            key={item.q}
            question={item.q}
            answer={item.a}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </View>

      <View className="gap-2.5">
        <Text className="font-sans-semibold text-base text-ink">Policies</Text>
        <Pressable
          onPress={() => router.push('/support/returns')}
          accessibilityRole="button"
          className="flex-row items-center justify-between rounded-xl border border-border bg-surface p-4 active:bg-surface-muted">
          <View className="flex-row items-center gap-3">
            <Icon name="rotate-ccw" size={18} color={c.primary} />
            <Text className="font-sans-medium text-sm text-ink">Return &amp; Refund Policy</Text>
          </View>
          <Icon name="chevron-right" size={18} color={c.muted} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/support/shipping')}
          accessibilityRole="button"
          className="flex-row items-center justify-between rounded-xl border border-border bg-surface p-4 active:bg-surface-muted">
          <View className="flex-row items-center gap-3">
            <Icon name="truck" size={18} color={c.primary} />
            <Text className="font-sans-medium text-sm text-ink">Delivery Policy</Text>
          </View>
          <Icon name="chevron-right" size={18} color={c.muted} />
        </Pressable>
      </View>

      <View className="gap-2.5">
        <Text className="font-sans-semibold text-base text-ink">Still need help?</Text>
        {supportEmail ? (
          <Pressable
            onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-xl border border-border bg-surface p-4 active:bg-surface-muted">
            <Icon name="info" size={18} color={c.primary} />
            <Text className="flex-1 font-sans-medium text-sm text-link">{supportEmail}</Text>
          </Pressable>
        ) : null}
        {supportPhone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${supportPhone}`)}
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-xl border border-border bg-surface p-4 active:bg-surface-muted">
            <Icon name="info" size={18} color={c.primary} />
            <Text className="flex-1 font-sans-medium text-sm text-link">{supportPhone}</Text>
          </Pressable>
        ) : null}
      </View>
    </LegalScreen>
  );
}