/**
 * Component tests for the review list added in roadmap 3.1-3.3: the vote
 * buttons, the filter chips, and the list that ties them to the optimistic
 * vote flow. The service module is mocked, so these cover what the screen does
 * with each backend answer - including "backend missing", which must leave no
 * vote UI behind.
 */
const React = require('react');
// `screen` is a live binding that render() reassigns, so it is read off the module
// at use time rather than destructured (a destructured copy would stay empty).
const RNTL = require('@testing-library/react-native');

const { render, fireEvent, waitFor } = RNTL;
const screen = new Proxy({}, { get: (_target, key) => RNTL.screen[key] });

jest.mock('@/services/reviewsPlus', () => ({
  fetchReviewVotes: jest.fn(),
  voteOnReview: jest.fn(),
  reviewPhotoUrl: (path) => `https://cdn.test/${path}`,
}));

const { fetchReviewVotes, voteOnReview } = require('@/services/reviewsPlus');
const { subscribeToToasts } = require('@/lib/toast');
const { ReviewVoteButtons } = require('@/components/reviews/ReviewVoteButtons');
const { ReviewFilterBar } = require('@/components/reviews/ReviewFilterBar');
const { ReviewsList } = require('@/components/reviews/ReviewsList');

const REVIEWS = [
  { id: 'r1', userName: 'Asha K.', rating: 5, comment: 'Loved it', createdAt: '2026-09-03T00:00:00Z', photos: ['u/a.jpg'] },
  { id: 'r2', userName: 'Ben T.', rating: 3, comment: 'It is okay', createdAt: '2026-09-02T00:00:00Z', photos: [] },
  { id: 'r3', userName: 'Chitra R.', rating: 5, comment: 'Great value', createdAt: '2026-09-01T00:00:00Z' },
];

describe('<ReviewVoteButtons>', () => {
  const vote = { helpfulCount: 3, unhelpfulCount: 1, myVote: 0 };

  it('shows the helpful count and a plain "Not helpful" button', () => {
    render(<ReviewVoteButtons vote={vote} onVote={jest.fn()} />);
    expect(screen.getByText('Helpful (3)')).toBeTruthy();
    expect(screen.getByText('Not helpful')).toBeTruthy();
  });

  it('reports which side was tapped', () => {
    const onVote = jest.fn();
    render(<ReviewVoteButtons vote={vote} onVote={onVote} />);
    fireEvent.press(screen.getByLabelText('Helpful (3)'));
    fireEvent.press(screen.getByLabelText('Not helpful'));
    expect(onVote.mock.calls).toEqual([[1], [-1]]);
  });

  it('highlights only my vote', () => {
    const { rerender } = render(<ReviewVoteButtons vote={{ ...vote, myVote: 1 }} onVote={jest.fn()} />);
    expect(screen.getByLabelText('Helpful (3)').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Not helpful').props.accessibilityState.selected).toBe(false);
    rerender(<ReviewVoteButtons vote={{ ...vote, myVote: -1 }} onVote={jest.fn()} />);
    expect(screen.getByLabelText('Helpful (3)').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('Not helpful').props.accessibilityState.selected).toBe(true);
  });

  it('ignores taps while a vote is in flight', () => {
    const onVote = jest.fn();
    render(<ReviewVoteButtons vote={vote} onVote={onVote} disabled />);
    fireEvent.press(screen.getByLabelText('Helpful (3)'));
    expect(onVote).not.toHaveBeenCalled();
  });
});

describe('<ReviewFilterBar>', () => {
  const counts = { 5: 2, 4: 0, 3: 1, 2: 0, 1: 0 };
  const setup = (props = {}) => {
    const handlers = { onRating: jest.fn(), onWithPhotos: jest.fn() };
    render(
      <ReviewFilterBar counts={counts} photoCount={1} rating={0} withPhotos={false} {...handlers} {...props} />
    );
    return handlers;
  };

  it('renders All, all five stars with counts, and With photos', () => {
    setup();
    expect(screen.getByLabelText('All')).toBeTruthy();
    [
      ['5 star reviews (2)', '5 (2)'],
      ['4 star reviews (0)', '4 (0)'],
      ['3 star reviews (1)', '3 (1)'],
      ['2 star reviews (0)', '2 (0)'],
      ['1 star reviews (0)', '1 (0)'],
    ].forEach(([label, text]) => {
      expect(screen.getByLabelText(label)).toBeTruthy();
      expect(screen.getByText(text)).toBeTruthy();
    });
    expect(screen.getByLabelText('With photos (1)')).toBeTruthy();
  });

  it('disables a star with no reviews, so pressing it does nothing', () => {
    const { onRating } = setup();
    const empty = screen.getByLabelText('4 star reviews (0)');
    expect(empty.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(empty);
    expect(onRating).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('5 star reviews (2)'));
    expect(onRating).toHaveBeenCalledWith(5);
  });

  it('marks the active rating and toggles With photos', () => {
    const { onWithPhotos } = setup({ rating: 3, withPhotos: true });
    expect(screen.getByLabelText('3 star reviews (1)').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('All').props.accessibilityState.selected).toBe(false);
    fireEvent.press(screen.getByLabelText('With photos (1)'));
    expect(onWithPhotos).toHaveBeenCalledWith(false);
  });

  it('hides the With photos chip when no review has a photo', () => {
    setup({ photoCount: 0 });
    expect(screen.queryByText(/With photos/)).toBeNull();
  });
});

describe('<ReviewsList>', () => {
  let toasts;
  let unsubscribe;

  beforeEach(() => {
    toasts = [];
    unsubscribe = subscribeToToasts((t) => toasts.push(t));
    fetchReviewVotes.mockResolvedValue({
      r1: { helpfulCount: 2, unhelpfulCount: 0, myVote: 0 },
    });
  });

  afterEach(() => unsubscribe());

  const renderList = (props = {}) =>
    render(<ReviewsList productId="p1" reviews={REVIEWS} userId="u-me" {...props} />);

  it('shows every review by default, newest first, with the total', async () => {
    renderList();
    await waitFor(() => expect(screen.getByText('Helpful (2)')).toBeTruthy());
    expect(screen.getByText('3 reviews')).toBeTruthy();
    const names = screen.getAllByText(/^(Asha K\.|Ben T\.|Chitra R\.)$/).map((n) => n.props.children);
    expect(names).toEqual(['Asha K.', 'Ben T.', 'Chitra R.']);
  });

  it('narrows by star, then shows the empty state with a working Clear filters', async () => {
    renderList();
    await waitFor(() => expect(fetchReviewVotes).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('3 star reviews (1)'));
    expect(screen.getByText('Showing 1 of 3')).toBeTruthy();
    expect(screen.queryByText('Asha K.')).toBeNull();
    expect(screen.getByText('Ben T.')).toBeTruthy();

    // 3-star AND with-photos matches nothing.
    fireEvent.press(screen.getByLabelText('With photos (1)'));
    expect(screen.getByText('No reviews match these filters')).toBeTruthy();
    fireEvent.press(screen.getByText('Clear filters'));
    expect(screen.queryByText('No reviews match these filters')).toBeNull();
    expect(screen.getByText('3 reviews')).toBeTruthy();
  });

  it('applies a vote optimistically, then keeps the server tallies', async () => {
    let resolveVote;
    voteOnReview.mockReturnValue(new Promise((resolve) => (resolveVote = resolve)));
    renderList();
    await waitFor(() => expect(screen.getByText('Helpful (2)')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Helpful (2)'));
    // Before the server answers the count has already moved.
    expect(screen.getByLabelText('Helpful (3)').props.accessibilityState.selected).toBe(true);
    expect(voteOnReview).toHaveBeenCalledWith('r1', 1);

    resolveVote({ helpfulCount: 5, unhelpfulCount: 0, myVote: 1 });
    await waitFor(() => expect(screen.getByLabelText('Helpful (5)')).toBeTruthy());
  });

  it("rolls back and toasts the server's message when a vote is refused", async () => {
    voteOnReview.mockRejectedValue(new Error('You cannot vote on your own review'));
    renderList();
    await waitFor(() => expect(screen.getByText('Helpful (2)')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Helpful (2)'));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ type: 'error', message: 'You cannot vote on your own review' });
    const helpful = screen.getByLabelText('Helpful (2)');
    expect(helpful.props.accessibilityState.selected).toBe(false);
  });

  it('asks signed-out visitors to sign in instead of calling the server', async () => {
    renderList({ userId: undefined });
    await waitFor(() => expect(screen.getByText('Helpful (2)')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Helpful (2)'));
    expect(voteOnReview).not.toHaveBeenCalled();
    expect(toasts[0]).toMatchObject({ type: 'error', message: 'Please sign in to vote' });
  });

  it('renders no vote buttons when the backend feature is missing', async () => {
    fetchReviewVotes.mockResolvedValue(null);
    renderList();
    await waitFor(() => expect(fetchReviewVotes).toHaveBeenCalled());
    expect(screen.getByText('Asha K.')).toBeTruthy();
    expect(screen.queryByText(/Helpful \(/)).toBeNull();
    expect(screen.queryByText('Not helpful')).toBeNull();
  });
});