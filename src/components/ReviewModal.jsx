import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/Icon';
import { StarPicker } from '@/components/Stars';
import { useThemeColors } from '@/hooks/useThemeColors';
import { toast } from '@/lib/toast';
import { MAX_REVIEW_PHOTOS, MAX_REVIEW_PHOTO_BYTES, reviewPhotoUrl } from '@/services/reviewsPlus';
import { validateImageFile } from '@/utils/uploadValidation';

/**
 * Ported from UserOrdersPage.jsx / UserPastOrdersPage.jsx's mobile "Write a
 * Review" bottom sheet (near-identical between the two source pages —
 * rendered as an RN Modal, same Modal-over-backdrop pattern as
 * FiltersSheet/PaymentMethodSheet). The web version's star hover-preview
 * (`onMouseEnter`/`onMouseLeave`) has no touch equivalent and isn't ported —
 * tapping a star sets the rating directly, same as touching it would do on
 * web anyway.
 *
 * Validation: the two source pages actually disagree here — UserOrdersPage
 * requires both rating AND comment, UserPastOrdersPage requires only rating
 * (comment optional). This doesn't need reconciling: Phase 13's re-read
 * confirmed UserOrdersPage's mobile review entry point is unreachable dead
 * code (delivered orders never appear on that page), so only
 * UserPastOrdersPage's rule is ever actually exercised — that's the one
 * used here.
 *
 * Phase 16: wrapped in KeyboardAvoidingView — the comment field sits near
 * the bottom of this bottom sheet, where the keyboard would otherwise cover
 * it (an RN `Modal` doesn't auto-avoid the keyboard the way the web app's
 * normal document flow does).
 *
 * Photos (roadmap 3.1): an optional strip of up to 4 pictures from the
 * library. When editing an existing review, `initialPhotos` (storage paths)
 * are shown too and can be removed. `onSubmit` receives `{ files, keep }` as
 * its third argument — the newly picked assets and the existing paths still
 * wanted — so the caller owns uploading (a photo failure must not fail the
 * review itself). The form scrolls once the strip, comment and keyboard no
 * longer fit on screen.
 */
export function ReviewModal({
  visible,
  onClose,
  product,
  initialRating = 0,
  initialComment = '',
  initialPhotos = [],
  onSubmit,
}) {
  const c = useThemeColors();
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [kept, setKept] = useState(initialPhotos);
  const [picked, setPicked] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // `initialPhotos` is usually a fresh array on every parent render, so the
  // effect is keyed on its contents instead — otherwise any parent re-render
  // would wipe the photos the user is part-way through choosing. Storage paths
  // never contain '|' (see uploadReviewPhotos).
  const photosKey = initialPhotos.join('|');
  useEffect(() => {
    setRating(initialRating);
    setComment(initialComment);
    setKept(photosKey ? photosKey.split('|') : []);
    setPicked([]);
    setPhotoError('');
  }, [product, initialRating, initialComment, photosKey]);

  const photoCount = kept.length + picked.length;

  const pickPhotos = async () => {
    const remaining = MAX_REVIEW_PHOTOS - photoCount;
    if (remaining <= 0) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to add photos to your review.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const accepted = [];
    let firstError = '';
    result.assets.slice(0, remaining).forEach((asset) => {
      const check = validateImageFile(asset, { maxBytes: MAX_REVIEW_PHOTO_BYTES, allowGif: false });
      if (check.ok) accepted.push(asset);
      else if (!firstError) firstError = check.error;
    });
    if (accepted.length) setPicked((prev) => [...prev, ...accepted]);
    // Also shown inline: on iOS this Modal's own window can cover the toast.
    setPhotoError(firstError);
    if (firstError) toast.error(firstError);
  };

  const handleSubmit = async () => {
    if (!rating) {
      // Source: UserPastOrdersPage's submitReview. This used to return
      // silently, so tapping Submit with no rating looked like a dead button.
      toast.error('Please add a rating');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(rating, comment, { files: picked, keep: kept });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-overlay" onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="max-h-[92%] rounded-t-2xl bg-surface p-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-sans-bold text-lg text-ink">Write a Review</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            className="active:opacity-60">
            <Icon name="x" size={20} color={c.muted} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-4">
          <Text className="text-[13px] text-muted">{product?.title}</Text>

          {/* Source: five `Star size={30}` at 8px gap, chart-gold when set. */}
          <StarPicker value={rating} onChange={setRating} size={30} gap={8} />

          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Share your thoughts about this product…"
            placeholderTextColor={c.muted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="h-24 rounded-xl border border-border bg-surface-muted p-3 font-sans text-sm text-ink"
          />

          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-sans-semibold text-[13px] text-ink">
                Add photos (up to {MAX_REVIEW_PHOTOS})
              </Text>
              <Text className="font-sans text-xs text-muted">
                {photoCount}/{MAX_REVIEW_PHOTOS}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2.5">
              {kept.map((path) => (
                <PhotoThumb
                  key={path}
                  uri={reviewPhotoUrl(path)}
                  onRemove={() => setKept((prev) => prev.filter((p) => p !== path))}
                />
              ))}
              {picked.map((asset) => (
                <PhotoThumb
                  key={asset.uri}
                  uri={asset.uri}
                  onRemove={() => setPicked((prev) => prev.filter((p) => p !== asset))}
                />
              ))}
              {photoCount < MAX_REVIEW_PHOTOS ? (
                <Pressable
                  onPress={pickPhotos}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Add photos"
                  className="h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-muted active:opacity-70">
                  <Icon name="image" size={20} color={c.muted} />
                </Pressable>
              ) : null}
            </View>
            {photoError ? (
              <Text className="font-sans-medium text-xs text-error">{photoError}</Text>
            ) : null}
          </View>
        </ScrollView>

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="h-12 items-center justify-center rounded-full bg-primary"
          style={{ opacity: submitting ? 0.6 : 1 }}>
          <Text className="font-sans-bold text-base text-inverse">
            {submitting ? 'Submitting…' : 'Submit Review'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A 64px square preview with a remove "×" in its corner. */
function PhotoThumb({ uri, onRemove }) {
  return (
    <View className="h-16 w-16">
      <Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove photo"
        hitSlop={6}
        className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full active:opacity-70"
        // A fixed dark disc with a white glyph: `bg-ink` flips to light in dark
        // mode, which would swallow the white ×.
        style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
        <Icon name="x" size={12} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}