import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Stars } from '@/components/Stars';
import { ReviewVoteButtons } from '@/components/reviews/ReviewVoteButtons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { reviewPhotoUrl } from '@/services/reviewsPlus';

// Moved here from the product screen along with the card markup (originally
// ported from ProductDetail.jsx's review list).
const getInitials = (name) => {
  if (!name) return 'A';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return parts
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const toReviewDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * One review. `vote` is this review's tallies, or null when the voting backend
 * isn't available (no buttons then). `onOpenPhoto(urls, index)` opens the
 * parent's full-screen viewer.
 */
export function ReviewCard({ review, index, vote, voteBusy, onVote, onOpenPhoto }) {
  const c = useThemeColors();
  const initials = getInitials(review.userName);
  const reviewDate = toReviewDate(review.createdAt);
  const dateStr = reviewDate
    ? reviewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  // Source alternates the avatar chip between info-subtle and error-subtle by
  // row index.
  const avatarBg = index % 2 === 0 ? 'bg-info-subtle' : 'bg-error-subtle';
  const photoUrls = (review.photos || []).map(reviewPhotoUrl);

  return (
    <View className="gap-2 rounded-xl bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className={`h-10 w-10 items-center justify-center rounded-full ${avatarBg}`}>
          <Text className="font-sans-bold text-base text-ink">{initials}</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-sans-bold text-sm text-ink">{review.userName || 'Anonymous'}</Text>
            <Stars rating={Number(review.rating) || 0} size={12} round={false} />
          </View>
          <View className="flex-row items-center gap-1.5">
            {dateStr ? <Text className="font-sans-medium text-[10px] text-muted">{dateStr}</Text> : null}
            <View className="flex-row items-center gap-0.5">
              <Icon name="check" size={10} color={c.success} />
              <Text className="font-sans-semibold text-[10px] text-success">Verified Purchase</Text>
            </View>
          </View>
        </View>
      </View>

      {review.comment ? (
        <Text className="font-sans text-sm leading-5 text-body">{review.comment}</Text>
      ) : null}

      {photoUrls.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 pt-1">
          {photoUrls.map((url, i) => (
            <Pressable
              key={url}
              onPress={() => onOpenPhoto(photoUrls, i)}
              accessibilityRole="button"
              accessibilityLabel={`View review photo ${i + 1} of ${photoUrls.length}`}
              className="active:opacity-70">
              <Image
                source={{ uri: url }}
                style={{ width: 64, height: 64, borderRadius: 8 }}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {vote ? <ReviewVoteButtons vote={vote} disabled={voteBusy} onVote={onVote} /> : null}
    </View>
  );
}