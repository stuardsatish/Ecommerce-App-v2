import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { toast } from '@/lib/toast';
import { customerEvents, eventLabel, formatDay, shipmentStatusMeta, summarizeTracking, trackingSteps } from '@/utils/shipmentModel';

/**
 * "Track your order" card of the order-detail screen (customer only - the admin's shipment tools exist on the website only).
 * Shows what the customer may see: courier, tracking number / link, expected date and the courier's history. Never charges or staff
 * notes: those columns are not readable for customers at all. Renders nothing for cancelled orders.
 * Pure data rules (statuses, stepper, headline) live in @/utils/shipmentModel (a byte-identical copy of the website's module).
 */
const TONE_CLASS = {
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent-strong',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-accent-strong',
  danger: 'bg-error-subtle text-error',
  neutral: 'bg-surface-muted text-body',
};

const fmtDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};
const fmtDateTime = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime())
    ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
};

function StatusChip({ status, label }) {
  const meta = shipmentStatusMeta(status);
  const [bg, fg] = TONE_CLASS[meta.tone].split(' ');
  return (
    <View className={`rounded-full px-2.5 py-1 ${bg}`}>
      <Text className={`font-sans-bold text-[11px] ${fg}`}>{label || meta.label}</Text>
    </View>
  );
}

export function TrackingCard({ order }) {
  const c = useThemeColors();
  const [showAll, setShowAll] = useState(false);
  const t = summarizeTracking(order);
  if (t.orderStatus === 'cancelled') return null;

  const steps = trackingSteps(order);
  const events = t.shipments
    .flatMap((s) => customerEvents(s).map((e) => ({ ...e, parcel: t.multiple ? s.trackingNumber || s.courierName : '' })))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const shown = showAll ? events : events.slice(0, 4);

  const copy = async (text) => {
    try {
      await Clipboard.setStringAsync(String(text));
      toast.success('Tracking number copied');
    } catch {
      toast.error('Could not copy the tracking number');
    }
  };
  const openLink = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.error('Could not open the tracking link');
    }
  };

  return (
    <View className="gap-4 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Icon name="truck" size={16} color={c.primary} />
          <Text className="font-sans-bold text-base text-ink">Track your order</Text>
        </View>
        {t.hasShipments ? (
          <StatusChip status={t.status} label={t.multiple ? `${t.deliveredCount} of ${t.total} delivered` : undefined} />
        ) : null}
      </View>

      <View className="flex-row">
        {steps.map((s, i) => (
          <View key={s.key} className="flex-1 items-center">
            <View className="w-full flex-row items-center">
              <View className={`h-[3px] flex-1 ${i === 0 ? 'bg-transparent' : s.done ? 'bg-primary' : 'bg-border'}`} />
              <View
                className={`h-[22px] w-[22px] items-center justify-center rounded-full ${
                  s.warn ? 'bg-accent-strong' : s.done ? 'bg-primary' : 'bg-border'
                }`}>
                {s.done ? <Icon name="check" size={12} color={c.inverse} /> : null}
              </View>
              <View
                className={`h-[3px] flex-1 ${
                  i === steps.length - 1 ? 'bg-transparent' : steps[i + 1].done ? 'bg-primary' : 'bg-border'
                }`}
              />
            </View>
            <Text
              numberOfLines={2}
              className={`mt-1.5 text-center text-[10px] ${s.current ? 'font-sans-bold text-ink' : s.done ? 'text-ink' : 'text-muted'}`}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {t.needsAttention ? (
        <View className="flex-row items-start gap-2 rounded-lg border border-warning-border bg-warning-subtle p-3">
          <Icon name="alert-triangle" size={16} color={c.accentStrong} />
          <Text className="flex-1 text-[13px] text-accent-strong">
            {shipmentStatusMeta(t.status).label}. We will get in touch to arrange another attempt - or contact us if you have not heard
            from us.
          </Text>
        </View>
      ) : null}

      {t.hasShipments ? (
        <View className="gap-3">
          {t.shipments.map((s) => (
            <View key={s.id} className="gap-1.5 rounded-lg border border-border p-3">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 font-sans-bold text-[14px] text-ink">{s.courierName || 'Courier'}</Text>
                {t.multiple ? <StatusChip status={s.status} /> : null}
              </View>
              {s.trackingNumber ? (
                <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
                  <Text selectable className="font-sans-medium text-[13px] text-ink">
                    {s.trackingNumber}
                  </Text>
                  <Pressable onPress={() => copy(s.trackingNumber)} hitSlop={8} className="flex-row items-center gap-1 active:opacity-60">
                    <Icon name="copy" size={13} color={c.body} />
                    <Text className="font-sans-semibold text-xs text-body">Copy</Text>
                  </Pressable>
                  {s.trackingUrl ? (
                    <Pressable onPress={() => openLink(s.trackingUrl)} hitSlop={8} className="flex-row items-center gap-1 active:opacity-60">
                      <Text className="font-sans-bold text-xs text-link">Track on courier site</Text>
                      <Icon name="external-link" size={13} color={c.link} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              <Text className="text-xs text-body">
                {s.shippedAt ? `Shipped ${fmtDate(s.shippedAt)}` : ''}
                {s.status !== 'delivered' && s.expectedDeliveryDate
                  ? `${s.shippedAt ? ' · ' : ''}Expected by ${formatDay(s.expectedDeliveryDate)}`
                  : ''}
                {s.status === 'delivered' && s.deliveredAt ? ` · Delivered ${fmtDateTime(s.deliveredAt)}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-[14px] text-body">
          {t.legacyShipped
            ? 'Your order has been shipped. The courier details were not recorded for this order - contact us if you need them.'
            : t.orderStatus === 'delivered'
              ? `Delivered${order.deliveredAt ? ` on ${fmtDate(order.deliveredAt)}` : ''}.`
              : 'We will show the courier and tracking number here as soon as your order ships.'}
        </Text>
      )}

      {events.length ? (
        <View className="gap-2.5">
          <Text className="font-sans-bold text-[11px] uppercase tracking-wide text-body">Updates</Text>
          {shown.map((e, i) => (
            <View key={e.id || i} className="flex-row gap-2.5">
              <View className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-primary' : 'bg-border-strong'}`} />
              <View className="flex-1">
                <Text className="font-sans-semibold text-[13px] text-ink">
                  {eventLabel(e.type)}
                  {e.parcel ? <Text className="font-sans text-muted">{` (${e.parcel})`}</Text> : null}
                </Text>
                <Text className="text-xs text-body">
                  {fmtDateTime(e.occurredAt)}
                  {e.location ? ` · ${e.location}` : ''}
                  {e.description && e.description !== 'Shipment created' && e.description !== eventLabel(e.type)
                    ? ` · ${e.description}`
                    : ''}
                </Text>
              </View>
            </View>
          ))}
          {events.length > 4 ? (
            <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={8}>
              <Text className="font-sans-bold text-xs text-link">
                {showAll ? 'Show fewer' : `Show all ${events.length} updates`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}