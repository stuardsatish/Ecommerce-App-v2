import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getPromoBanner } from '@/services/settingsService';

/**
 * Promotional banner with a flash-sale countdown (roadmap task 2.4).
 *
 * Content comes from the admin-configurable `settings` row `promoBanner` (see
 * `getPromoBanner`), so a promotion can be started, re-worded, or ended
 * without an app release. Renders nothing at all unless a promotion is
 * explicitly enabled, so stores that never configure one are unaffected.
 *
 * The countdown is the reason this needs a live ticker rather than a static
 * render. Two details that matter:
 *   - The interval is only created when there IS an `endsAt` to count down to,
 *     so an open-ended promotion doesn't wake a timer every second for nothing.
 *   - When the deadline passes the banner hides ITSELF, without needing the
 *     admin to flip `enabled` off. An expired "ends in 00:00:00" banner is
 *     worse than no banner, and the admin can't be relied on to be awake at
 *     the moment a flash sale ends.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Splits a remaining-millisecond count into d/h/m/s, or null once elapsed. */
const breakdown = (ms) => {
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

export function PromoBanner() {
  const c = useThemeColors();
  const [promo, setPromo] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const endsAtMs = useRef(null);

  useEffect(() => {
    let active = true;
    getPromoBanner()
      .then((data) => {
        if (!active || !data?.enabled) return;
        const ts = data.endsAt ? new Date(data.endsAt).getTime() : NaN;
        // An unparseable or already-past deadline means there's nothing to
        // promote — treat it the same as being switched off.
        if (data.endsAt && (isNaN(ts) || ts <= Date.now())) return;
        endsAtMs.current = isNaN(ts) ? null : ts;
        setPromo(data);
        if (endsAtMs.current) setRemaining(breakdown(endsAtMs.current - Date.now()));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!promo || !endsAtMs.current) return;
    const tick = () => {
      const next = breakdown(endsAtMs.current - Date.now());
      setRemaining(next);
      // Deadline reached — drop the banner rather than show a dead timer.
      if (!next) setPromo(null);
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [promo]);

  if (!promo) return null;

  const toneBg =
    promo.tone === 'accent' ? c.accent : promo.tone === 'success' ? c.success : c.primary;
  const toneFg =
    promo.tone === 'accent' ? c.accentFg : promo.tone === 'success' ? c.successFg : c.primaryFg;

  const segments = remaining
    ? [
        ...(remaining.days > 0 ? [[remaining.days, 'd']] : []),
        [pad(remaining.hours), 'h'],
        [pad(remaining.minutes), 'm'],
        [pad(remaining.seconds), 's'],
      ]
    : [];

  return (
    <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: toneBg }}>
      <View className="gap-2 p-4">
        <View className="flex-row items-center gap-2">
          <Icon name="clock" size={14} color={toneFg} />
          <Text className="font-sans-bold text-[15px]" style={{ color: toneFg }}>
            {promo.title || 'Limited time offer'}
          </Text>
        </View>

        {promo.subtitle ? (
          <Text className="font-sans text-[13px] leading-[19px]" style={{ color: toneFg, opacity: 0.9 }}>
            {promo.subtitle}
          </Text>
        ) : null}

        {segments.length > 0 ? (
          <View className="flex-row items-center gap-1.5">
            <Text className="font-sans text-[11px]" style={{ color: toneFg, opacity: 0.85 }}>
              Ends in
            </Text>
            {segments.map(([value, unit]) => (
              <View
                key={unit}
                className="flex-row items-baseline rounded-md px-1.5 py-0.5"
                style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}>
                <Text
                  className="font-sans-bold text-[13px]"
                  // Tabular figures stop the row from jittering as the digits
                  // change each second.
                  style={{ color: toneFg, fontVariant: ['tabular-nums'] }}>
                  {value}
                </Text>
                <Text className="font-sans text-[10px]" style={{ color: toneFg, opacity: 0.8 }}>
                  {unit}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {promo.ctaLabel ? (
          <Pressable
            onPress={() => router.push('/products')}
            accessibilityRole="button"
            className="mt-1 self-start rounded-full px-4 py-2 active:opacity-80"
            style={{ backgroundColor: toneFg }}>
            <Text className="font-sans-bold text-[12px]" style={{ color: toneBg }}>
              {promo.ctaLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}