import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { ReviewFilterBar } from '@/components/reviews/ReviewFilterBar';
import { ReviewPhotoViewer } from '@/components/reviews/ReviewPhotoViewer';
import { ReviewSortSheet, SORT_LABELS } from '@/components/reviews/ReviewSortSheet';
import { useThemeColors } from '@/hooks/useThemeColors';
import { toast } from '@/lib/toast';
import { fetchReviewVotes, voteOnReview } from '@/services/reviewsPlus';
import {
  EMPTY_VOTE,
  applyVote,
  filterAndSortReviews,
  photoReviewCount,
  ratingCounts,
} from '@/utils/reviewFilters';

/**
 * The product screen's review list: filter chips, sort, helpful votes, photo
 * viewer and the "nothing matches" state. Filters only ever narrow what is
 * shown — with none active this renders every review, newest first.
 *
 * Votes live here rather than in the screen: `votes === null` means the
 * backend feature is missing (or the fetch failed), and then no vote buttons
 * and no "Most helpful" sort are offered.
 * @param {{ productId: string, reviews: Array, userId?: string }} props
 */
export function ReviewsList({ productId, reviews, userId }) {
  const c = useThemeColors();
  const [rating, setRating] = useState(0);
  const [withPhotos, setWithPhotos] = useState(false);
  const [sort, setSort] = useState('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [votes, setVotes] = useState(null);
  const [pending, setPending] = useState({});
  const [viewer, setViewer] = useState(null);

  // Re-fetched when the signed-in user changes because `my_vote` is per user.
  useEffect(() => {
    let active = true;
    fetchReviewVotes(productId)
      .then((result) => {
        if (active) setVotes(result);
      })
      .catch((err) => {
        console.warn('Review votes fetch error:', err?.message || err);
        if (active) setVotes(null);
      });
    return () => {
      active = false;
    };
  }, [productId, userId]);

  const counts = useMemo(() => ratingCounts(reviews), [reviews]);
  const photoCount = useMemo(() => photoReviewCount(reviews), [reviews]);
  const votingOn = votes !== null;
  const effectiveSort = sort === 'helpful' && !votingOn ? 'recent' : sort;
  const shown = useMemo(
    () => filterAndSortReviews(reviews, { rating, withPhotos, sort: effectiveSort, votes }),
    [reviews, rating, withPhotos, effectiveSort, votes]
  );
  const filtering = rating > 0 || withPhotos;

  const clearFilters = () => {
    setRating(0);
    setWithPhotos(false);
  };

  const handleVote = async (review, choice) => {
    if (!userId) {
      toast.error('Please sign in to vote');
      return;
    }
    if (pending[review.id]) return;
    const before = votes?.[review.id] || EMPTY_VOTE;
    const { vote, row } = applyVote(before, choice);
    // Optimistic: show the result immediately, then swap in the server's
    // authoritative tallies — or roll back and say why it was refused.
    setVotes((prev) => ({ ...prev, [review.id]: row }));
    setPending((prev) => ({ ...prev, [review.id]: true }));
    try {
      const server = await voteOnReview(review.id, vote);
      setVotes((prev) => ({ ...prev, [review.id]: server }));
    } catch (err) {
      setVotes((prev) => ({ ...prev, [review.id]: before }));
      toast.error(err?.message || 'Could not record your vote.');
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[review.id];
        return next;
      });
    }
  };

  const sortOptions = votingOn ? ['recent', 'highest', 'lowest', 'helpful'] : ['recent', 'highest', 'lowest'];

  return (
    <View className="gap-3">
      <ReviewFilterBar
        counts={counts}
        photoCount={photoCount}
        rating={rating}
        onRating={setRating}
        withPhotos={withPhotos}
        onWithPhotos={setWithPhotos}
      />

      <View className="flex-row items-center justify-between">
        <Text className="font-sans-medium text-xs text-muted">
          {shown.length === reviews.length
            ? `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`
            : `Showing ${shown.length} of ${reviews.length}`}
        </Text>
        <Pressable
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort reviews, currently ${SORT_LABELS[effectiveSort]}`}
          className="flex-row items-center gap-1 active:opacity-60">
          <Text className="font-sans-semibold text-xs text-ink">Sort: {SORT_LABELS[effectiveSort]}</Text>
          <Icon name="chevron-down" size={14} color={c.ink} />
        </Pressable>
      </View>

      {shown.length === 0 ? (
        <View className="items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-muted p-8">
          <Text className="font-sans-semibold text-[15px] text-ink">No reviews match these filters</Text>
          {filtering ? (
            <Pressable
              onPress={clearFilters}
              accessibilityRole="button"
              className="rounded-full border border-ink px-5 py-2 active:opacity-70">
              <Text className="font-sans-semibold text-xs text-ink">Clear filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        shown.map((review, i) => (
          <ReviewCard
            key={review.id}
            review={review}
            index={i}
            vote={votingOn ? votes[review.id] || EMPTY_VOTE : null}
            voteBusy={!!pending[review.id]}
            onVote={(choice) => handleVote(review, choice)}
            onOpenPhoto={(urls, index) => setViewer({ urls, index })}
          />
        ))
      )}

      <ReviewSortSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        options={sortOptions}
        value={effectiveSort}
        onSelect={setSort}
      />
      {viewer ? (
        <ReviewPhotoViewer photos={viewer.urls} startIndex={viewer.index} onClose={() => setViewer(null)} />
      ) : null}
    </View>
  );
}