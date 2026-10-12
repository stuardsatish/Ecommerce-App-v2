import { useEffect, useState } from 'react';

import { LegalScreen, LegalSection } from '@/components/LegalScreen';
import { getShippingSettings } from '@/services/settingsService';

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

/**
 * Delivery Policy (roadmap task 1.16).
 *
 * RN counterpart of the web `ShippingPolicyPage.jsx`, same wording and same
 * data source: the live `shippingSettings` row, so the stated free-shipping
 * threshold and flat rate always match what the cart actually charges rather
 * than drifting into a hardcoded claim. Falls back to a rate-free sentence
 * while the settings request is in flight or if it fails — exactly as the web
 * page does.
 */
export default function ShippingPolicyScreen() {
  const [shipping, setShipping] = useState(null);

  useEffect(() => {
    let active = true;
    getShippingSettings()
      .then((data) => active && setShipping(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <LegalScreen title="Delivery Policy" lastUpdated="October 2026">
      <LegalSection title="Shipping cost">
        {shipping
          ? `Orders over ${money(shipping.freeShippingThreshold)} ship free. Orders under that amount have a flat shipping charge of ${money(shipping.shippingCost)}, shown at checkout before you pay.`
          : 'Shipping cost is calculated at checkout based on your order total.'}
      </LegalSection>

      <LegalSection title="Delivery time">
        Most orders are packed and handed to our delivery partner within 1–2 business days. Delivery
        typically takes a further 2–5 business days depending on your location.
      </LegalSection>

      <LegalSection title="Order tracking">
        You can check the current status of any order from My Orders. We&apos;ll also update the
        order status as it moves through confirmed, shipped, and delivered.
      </LegalSection>

      <LegalSection title="Delivery issues">
        If your order hasn&apos;t arrived within the expected window, or arrives damaged, contact us
        with your order number and we&apos;ll look into it right away.
      </LegalSection>
    </LegalScreen>
  );
}