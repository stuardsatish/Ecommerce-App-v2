/**
 * The product screen's review list is driven by these pure helpers, so the
 * rules the UI relies on are pinned here: chip counts agree with the
 * histogram's rounding, filters only narrow, every sort has a deterministic
 * tie-break, and the optimistic vote maths matches what the server will
 * return (so a later swap-in of the server's row isn't a visible jump).
 */
const {
  EMPTY_VOTE,
  applyVote,
  filterAndSortReviews,
  photoReviewCount,
  ratingCounts,
} = require('@/utils/reviewFilters');

const review = (id, rating, createdAt, photos) => ({ id, rating, createdAt, ...(photos ? { photos } : {}) });

const REVIEWS = [
  review('a', 5, '2026-09-01T10:00:00Z', ['u/a.jpg']),
  review('b', 3, '2026-09-03T10:00:00Z'),
  review('c', 5, '2026-09-02T10:00:00Z'),
  review('d', 1, '2026-08-20T10:00:00Z', ['u/d1.jpg', 'u/d2.jpg']),
];

const ids = (list) => list.map((r) => r.id);

describe('ratingCounts', () => {
  it('counts per star and always returns all five buckets', () => {
    expect(ratingCounts(REVIEWS)).toEqual({ 5: 2, 4: 0, 3: 1, 2: 0, 1: 1 });
    expect(ratingCounts([])).toEqual({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
    expect(ratingCounts(null)).toEqual({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
  });

  it('rounds like the histogram, and ignores ratings outside 1-5', () => {
    const counts = ratingCounts([review('x', 4.6, 'd'), review('y', 0, 'd'), review('z', 9, 'd')]);
    expect(counts).toEqual({ 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 });
  });
});

describe('photoReviewCount', () => {
  it('counts reviews with at least one photo, treating a missing field as none', () => {
    expect(photoReviewCount(REVIEWS)).toBe(2);
    expect(photoReviewCount([review('x', 5, 'd', [])])).toBe(0);
    expect(photoReviewCount(undefined)).toBe(0);
  });
});

describe('filterAndSortReviews', () => {
  it('with no options returns every review, newest first', () => {
    expect(ids(filterAndSortReviews(REVIEWS))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('rating 0 means all stars; a star value narrows to that bucket', () => {
    expect(filterAndSortReviews(REVIEWS, { rating: 0 })).toHaveLength(4);
    expect(ids(filterAndSortReviews(REVIEWS, { rating: 5 }))).toEqual(['c', 'a']);
    expect(filterAndSortReviews(REVIEWS, { rating: 4 })).toEqual([]);
  });

  it('withPhotos keeps only reviews that have photos, and combines with a star filter', () => {
    expect(ids(filterAndSortReviews(REVIEWS, { withPhotos: true }))).toEqual(['a', 'd']);
    expect(ids(filterAndSortReviews(REVIEWS, { withPhotos: true, rating: 5 }))).toEqual(['a']);
    expect(filterAndSortReviews(REVIEWS, { withPhotos: true, rating: 3 })).toEqual([]);
  });

  it('highest/lowest order by rating and break ties by recency', () => {
    expect(ids(filterAndSortReviews(REVIEWS, { sort: 'highest' }))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(filterAndSortReviews(REVIEWS, { sort: 'lowest' }))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('helpful orders by helpful count desc, then recency; reviews without a vote row count as 0', () => {
    const votes = { a: { helpfulCount: 2 }, d: { helpfulCount: 7 }, c: { helpfulCount: 2 } };
    expect(ids(filterAndSortReviews(REVIEWS, { sort: 'helpful', votes }))).toEqual(['d', 'c', 'a', 'b']);
  });

  it('helpful still works when votes is null (falls back to recency) and accepts snake_case rows', () => {
    expect(ids(filterAndSortReviews(REVIEWS, { sort: 'helpful', votes: null }))).toEqual(['b', 'c', 'a', 'd']);
    const snake = { a: { helpful_count: 3 } };
    expect(ids(filterAndSortReviews(REVIEWS, { sort: 'helpful', votes: snake }))[0]).toBe('a');
  });

  it('sorts undated reviews last under recent and never throws on junk', () => {
    const list = [review('x', 5, undefined), review('y', 5, '2026-01-01T00:00:00Z')];
    expect(ids(filterAndSortReviews(list))).toEqual(['y', 'x']);
    expect(filterAndSortReviews(undefined)).toEqual([]);
    expect(filterAndSortReviews([{ id: 'q' }], { sort: 'nonsense' })).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const copy = REVIEWS.slice();
    filterAndSortReviews(REVIEWS, { sort: 'lowest' });
    expect(REVIEWS).toEqual(copy);
  });
});

describe('applyVote', () => {
  it('casts a first helpful vote', () => {
    expect(applyVote(EMPTY_VOTE, 1)).toEqual({
      vote: 1,
      row: { helpfulCount: 1, unhelpfulCount: 0, myVote: 1 },
    });
  });

  it('clears the vote when the active button is tapped again', () => {
    const current = { helpfulCount: 4, unhelpfulCount: 1, myVote: 1 };
    expect(applyVote(current, 1)).toEqual({
      vote: 0,
      row: { helpfulCount: 3, unhelpfulCount: 1, myVote: 0 },
    });
  });

  it('moves the count across when switching sides', () => {
    const current = { helpfulCount: 4, unhelpfulCount: 1, myVote: 1 };
    expect(applyVote(current, -1)).toEqual({
      vote: -1,
      row: { helpfulCount: 3, unhelpfulCount: 2, myVote: -1 },
    });
  });

  it('tolerates a missing row and never goes negative', () => {
    expect(applyVote(undefined, -1).row).toEqual({ helpfulCount: 0, unhelpfulCount: 1, myVote: -1 });
    expect(applyVote({ helpfulCount: 0, unhelpfulCount: 0, myVote: 1 }, 1).row.helpfulCount).toBe(0);
  });
});