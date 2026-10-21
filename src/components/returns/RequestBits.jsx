import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { toast } from '@/lib/toast';
import { customerRefundLine, refundsToShow } from '@/utils/refundModel';
import { EVIDENCE_MAX_FILES, requestStatusMeta } from '@/utils/requestModel';
import { readPickedPhoto } from '@/utils/returnsMedia';

/**
 * Small pieces shared by the return / exchange screens (customer only - the admin side exists on the website).
 * Twin of the website's features/returns/RequestBits.jsx: same names, same rules (JPEG / PNG / WebP, 5 MB, at most 6 photos).
 */

// Literal class strings on purpose: the Tailwind scanner only sees whole class names, never a built-up `bg-${tone}`.
const TONE_CLASS = {
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent-strong',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-accent-strong',
  danger: 'bg-error-subtle text-error',
  neutral: 'bg-surface-muted text-body',
};

/** [background class, text class] of a tone, for the cards that colour a whole block (the refund / replacement / price-difference notices). */
export function toneClass(tone) {
  return (TONE_CLASS[tone] || TONE_CLASS.neutral).split(' ');
}

/** Coloured pill. `tone` = info | accent | success | warning | danger | neutral (the tones of requestStatusMeta / shipmentStatusMeta). */
export function ToneChip({ tone, label }) {
  const [bg, fg] = (TONE_CLASS[tone] || TONE_CLASS.neutral).split(' ');
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${bg}`}>
      <Text className={`font-sans-bold text-[11px] ${fg}`}>{label}</Text>
    </View>
  );
}

/** The status of a request in the customer's words (requestStatusMeta). */
export function RequestStatusChip({ status }) {
  const meta = requestStatusMeta(status);
  return <ToneChip tone={meta.tone} label={meta.label} />;
}

/**
 * The customer's refund status for ONE request (spec 9.3): "Refund processing" / "Refund completed" / "Refund failed - contact support".
 * `refunds` = the mapped refund rows of the request. Shows exactly what is stored - never an optimistic state. Renders nothing without one.
 */
export function RefundNotice({ refunds }) {
  const shown = refundsToShow(refunds);
  if (!shown.length) return null;
  return (
    <View className="gap-2">
      {shown.map((r) => {
        const l = customerRefundLine(r);
        const [bg, fg] = (TONE_CLASS[l.tone] || TONE_CLASS.neutral).split(' ');
        return (
          <View key={r.id} className={`gap-0.5 rounded-lg p-3 ${bg}`}>
            <Text className={`font-sans-bold text-[13px] ${fg}`}>{l.headline}</Text>
            <Text className="text-[13px] text-ink">{l.detail}</Text>
            {r.adjustmentAmount && r.adjustmentNote ? (
              <Text className="text-xs text-body">Includes an adjustment: {r.adjustmentNote}</Text>
            ) : null}
            <Text className="mt-1 text-[11px] text-muted">Refund {r.refundNo}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A 64px square preview with a remove "x" in its corner (same look as the review photo strip). */
function PhotoThumb({ uri, onRemove, disabled }) {
  return (
    <View className="h-16 w-16">
      <Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
      {!disabled ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove photo"
          hitSlop={6}
          className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full active:opacity-70"
          // A fixed dark disc with a white glyph: `bg-ink` flips to light in dark mode, which would swallow the white x.
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <Icon name="x" size={12} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Photo chooser with previews. `photos` = [{ id, uri, file }] where `file` = { name, type, size, body } is exactly what
 * services/returns.uploadEvidence() takes; `onChange(next)` gets the whole new list.
 *
 * Every picked photo is checked (type, size) and READ into memory right away (utils/returnsMedia.readPickedPhoto), so the
 * size we validate is the real one - the picker does not always report it - and an unreadable photo is reported next to the
 * button instead of failing the whole request at submit time. At most `max` photos (6 = the server's limit).
 */
export function PhotoPicker({ photos, onChange, max = EVIDENCE_MAX_FILES, disabled = false }) {
  const c = useThemeColors();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const pick = async () => {
    const room = max - photos.length;
    if (room <= 0 || disabled || reading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to add photos to your request.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    setReading(true);
    const next = [...photos];
    let firstError = '';
    for (const asset of result.assets.slice(0, room)) {
      try {
        const file = await readPickedPhoto(asset);
        if (next.some((p) => p.uri === asset.uri)) continue; // the same picture twice
        next.push({ id: `${asset.uri}#${next.length}`, uri: asset.uri, file });
      } catch (err) {
        if (!firstError) firstError = (err && err.message) || 'Could not read that photo.';
      }
    }
    setReading(false);
    // Also shown inline: on iOS a Modal's own window can cover the toast.
    setError(firstError);
    if (firstError) toast.error(firstError);
    onChange(next);
  };

  const remove = (id) => onChange(photos.filter((p) => p.id !== id));

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2.5">
        {photos.map((p) => (
          <PhotoThumb key={p.id} uri={p.uri} disabled={disabled} onRemove={() => remove(p.id)} />
        ))}
        {photos.length < max && !disabled ? (
          <Pressable
            onPress={pick}
            disabled={reading}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            className="h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-muted active:opacity-70">
            <Icon name={reading ? 'clock' : 'image'} size={20} color={c.muted} />
          </Pressable>
        ) : null}
      </View>
      <Text className="font-sans text-xs text-muted">
        JPEG, PNG or WebP, up to 5 MB each, at most {max}. {photos.length}/{max} added.
      </Text>
      {error ? <Text className="font-sans-medium text-xs text-error">{error}</Text> : null}
    </View>
  );
}