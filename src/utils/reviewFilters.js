// Pure helpers behind the product screen's review list: the per-star counts on
// the filter chips, filtering + sorting, and the optimistic helpful/not-helpful
// vote maths. No React / RN / network in here so it runs under the `logic`
// Jest project. The web app has a twin of this module (same names, same rules)
// so both apps order and filter a product's reviews identically.

export const REVIEW_SORTS = ['recent', 'highest', 'lowest', 'helpful'];

// The histogram on the screen buckets with Math.round, so a stray 4.6 can't
// create a sixth bucket. The chips must use the same rule or their counts
// would disagree with the bars right above them.
const starOf = (review) => Math.round(Number(review?.rating) || 0);

// "Highest/Lowest" compare the real rating, not the bucket, so 4.6 > 4.
const starOfExact = (review) => Number(review?.rating) || 0;

const timeOf = (review) => {
  const t = new Date(review?.createdAt).getTime();
  // Undated reviews sort last under "recent" rather than NaN-poisoning the compare.
  return Number.isNaN(t) ? 0 : t;
};

const hasPhotos = (review) => Array.isArray(review?.photos) && review.photos.length > 0;

// Accepts both the app's camelCase vote rows and raw `helpful_count` ones.
const helpfulOf = (vote) => Number(vote?.helpfulCount ?? vote?.helpful_count ?? 0) || 0;

/**
 * Number of reviews per star bucket.
 * @param {Array<{rating:number}>} reviews
 * @returns {{5:number,4:number,3:number,2:number,1:number}}
 */
export function ratingCounts(reviews) {
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  (reviews || []).forEach((review) => {
    const star = starOf(review);
    if (counts[star] !== undefined) counts[star] += 1;
  });
  return counts;
}

/** How many reviews carry at least one photo. */
export function photoReviewCount(reviews) {
  return (reviews || []).filter(hasPhotos).length;
}

/**
 * Narrow and order a review list. Never mutates its input.
 * @param {Array<{id:string,rating:number,createdAt:string,photos?:string[]}>} reviews
 * @param {{ rating?:number, withPhotos?:boolean, sort?:'recent'|'highest'|'lowest'|'helpful',
 *           votes?:Record<string,{helpfulCount?:number}>|null }} [opts]
 *   `rating: 0` means every star; `votes` only matters for `sort: 'helpful'`.
 */
export function filterAndSortReviews(reviews, { rating = 0, withPhotos = false, sort = 'recent', votes = null } = {}) {
  const wanted = Number(rating) || 0;
  const filtered = (reviews || []).filter((review) => {
    if (wanted > 0 && starOf(review) !== wanted) return false;
    if (withPhotos && !hasPhotos(review)) return false;
    return true;
  });

  const byRecent = (a, b) => timeOf(b) - timeOf(a);
  const compare =
    sort === 'highest'
      ? (a, b) => starOfExact(b) - starOfExact(a) || byRecent(a, b)
      : sort === 'lowest'
        ? (a, b) => starOfExact(a) - starOfExact(b) || byRecent(a, b)
        : sort === 'helpful'
          ? (a, b) => helpfulOf(votes?.[b.id]) - helpfulOf(votes?.[a.id]) || byRecent(a, b)
          : byRecent;

  // Array.prototype.sort is stable, so equal reviews keep their fetch order.
  return filtered.slice().sort(compare);
}

export const EMPTY_VOTE = { helpfulCount: 0, unhelpfulCount: 0, myVote: 0 };

/**
 * What a vote row looks like after the user taps `choice` (1 helpful,
 * -1 not helpful). Tapping the button that is already active clears the vote,
 * and switching sides moves the count across. Returns the new row plus the
 * value to send to `vote_on_review` (0 = clear).
 */
export function applyVote(current, choice) {
  const prev = { ...EMPTY_VOTE, ...(current || {}) };
  const next = prev.myVote === choice ? 0 : choice;

  let helpfulCount = prev.helpfulCount;
  let unhelpfulCount = prev.unhelpfulCount;
  if (prev.myVote === 1) helpfulCount -= 1;
  if (prev.myVote === -1) unhelpfulCount -= 1;
  if (next === 1) helpfulCount += 1;
  if (next === -1) unhelpfulCount += 1;

  return {
    vote: next,
    row: { helpfulCount: Math.max(0, helpfulCount), unhelpfulCount: Math.max(0, unhelpfulCount), myVote: next },
  };
}