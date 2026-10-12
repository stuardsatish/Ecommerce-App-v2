/**
 * <ProductQA> against a mocked service: what it renders for each permission
 * set, the collapse to three questions, and that every write refetches or
 * surfaces the server's message. `available: false` (SQL not applied) must
 * leave nothing on screen.
 */
const React = require('react');
// `screen` is a live binding that render() reassigns, so it is read off the module
// at use time rather than destructured (a destructured copy would stay empty).
const RNTL = require('@testing-library/react-native');

const { render, fireEvent, waitFor } = RNTL;
const screen = new Proxy({}, { get: (_target, key) => RNTL.screen[key] });

jest.mock('@/services/reviewsPlus', () => ({
  fetchProductQA: jest.fn(),
  askQuestion: jest.fn(),
  answerQuestion: jest.fn(),
  deleteQuestion: jest.fn(),
  deleteAnswer: jest.fn(),
}));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));

const svc = require('@/services/reviewsPlus');
const { confirmAction } = require('@/lib/confirm');
const { router } = require('expo-router');
const { subscribeToToasts } = require('@/lib/toast');
const { ProductQA } = require('@/components/reviews/ProductQA');

const answer = (over = {}) => ({
  id: 'a1',
  answer: 'Yes, it is grain free.',
  createdAt: '2026-10-06T00:00:00Z',
  answerer: 'Store',
  isStaff: true,
  isMine: false,
  ...over,
});

const question = (n, over = {}) => ({
  id: `q${n}`,
  question: `Question number ${n}?`,
  createdAt: '2026-10-05T00:00:00Z',
  asker: 'Asha K.',
  isMine: false,
  answers: [],
  ...over,
});

const qa = (over = {}) => ({
  available: true,
  permissions: { canAsk: true, canAnswer: false, isStaff: false },
  questions: [question(1)],
  ...over,
});

let toasts;
let unsubscribe;
beforeEach(() => {
  toasts = [];
  unsubscribe = subscribeToToasts((t) => toasts.push(t));
  svc.fetchProductQA.mockResolvedValue(qa());
});
afterEach(() => unsubscribe());

const renderQA = (props = {}) => render(<ProductQA productId="p1" userId="u-me" {...props} />);
const ready = () => waitFor(() => expect(screen.getByText(/Questions & Answers/)).toBeTruthy());

describe('<ProductQA>', () => {
  it('renders nothing when the backend feature is missing', async () => {
    svc.fetchProductQA.mockResolvedValue({ available: false, permissions: {}, questions: [] });
    const { toJSON } = renderQA();
    await waitFor(() => expect(svc.fetchProductQA).toHaveBeenCalled());
    expect(toJSON()).toBeNull();
  });

  it('shows the count, the asker line and a Store badge on staff answers', async () => {
    svc.fetchProductQA.mockResolvedValue(qa({ questions: [question(1, { answers: [answer()] })] }));
    renderQA();
    await ready();
    expect(screen.getByText('(1)')).toBeTruthy();
    expect(screen.getByText('Question number 1?')).toBeTruthy();
    expect(screen.getByText(/^Asked by Asha K\. · /)).toBeTruthy();
    expect(screen.getByText('Yes, it is grain free.')).toBeTruthy();
    expect(screen.getByText('Store')).toBeTruthy();
  });

  it('collapses to the first three questions and expands on demand', async () => {
    svc.fetchProductQA.mockResolvedValue(qa({ questions: [1, 2, 3, 4, 5].map((n) => question(n)) }));
    renderQA();
    await ready();
    expect(screen.queryByText('Question number 4?')).toBeNull();
    fireEvent.press(screen.getByText('Show all 5 questions'));
    expect(screen.getByText('Question number 5?')).toBeTruthy();
    fireEvent.press(screen.getByText('Show fewer questions'));
    expect(screen.queryByText('Question number 4?')).toBeNull();
  });

  it('sends signed-out visitors to the login screen instead of showing a composer', async () => {
    svc.fetchProductQA.mockResolvedValue(
      qa({ permissions: { canAsk: false, canAnswer: false, isStaff: false } })
    );
    renderQA({ userId: undefined });
    await ready();
    expect(screen.queryByLabelText('Ask a question about this product…')).toBeNull();
    fireEvent.press(screen.getByText('Sign in to ask a question'));
    expect(router.push).toHaveBeenCalledWith('/login');
  });

  it('explains why a signed-in user without permission cannot ask', async () => {
    svc.fetchProductQA.mockResolvedValue(
      qa({ permissions: { canAsk: false, canAnswer: false, isStaff: false } })
    );
    renderQA();
    await ready();
    expect(screen.getByText(/isn't available for this account/)).toBeTruthy();
    expect(screen.queryByLabelText('Ask a question about this product…')).toBeNull();
  });

  it('enforces the 5-character minimum and 500-character cap, then posts and refetches', async () => {
    svc.askQuestion.mockResolvedValue('new-id');
    renderQA();
    await ready();
    const input = screen.getByLabelText('Ask a question about this product…');
    expect(input.props.maxLength).toBe(500);

    fireEvent.changeText(input, 'abc');
    expect(screen.getByText('3/500')).toBeTruthy();
    fireEvent.press(screen.getByText('Post question'));
    expect(svc.askQuestion).not.toHaveBeenCalled();

    fireEvent.changeText(input, '  Is it grain free?  ');
    fireEvent.press(screen.getByText('Post question'));
    await waitFor(() => expect(svc.askQuestion).toHaveBeenCalledWith('p1', 'Is it grain free?'));
    await waitFor(() => expect(svc.fetchProductQA).toHaveBeenCalledTimes(2));
    expect(toasts.at(-1)).toMatchObject({ type: 'success' });
    expect(screen.getByLabelText('Ask a question about this product…').props.value).toBe('');
  });

  it("toasts the server's message when posting is refused", async () => {
    svc.askQuestion.mockRejectedValue(new Error('You are asking too fast. Please try again later.'));
    renderQA();
    await ready();
    fireEvent.changeText(screen.getByLabelText('Ask a question about this product…'), 'Anything at all?');
    fireEvent.press(screen.getByText('Post question'));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ type: 'error', message: 'You are asking too fast. Please try again later.' });
  });

  it('offers Answer only to people allowed to answer, and posts through answerQuestion', async () => {
    svc.answerQuestion.mockResolvedValue('a-new');
    svc.fetchProductQA.mockResolvedValue(
      qa({ permissions: { canAsk: true, canAnswer: true, isStaff: false } })
    );
    renderQA();
    await ready();
    fireEvent.press(screen.getByLabelText('Answer this question'));
    const box = screen.getByLabelText('Write your answer…');
    expect(box.props.maxLength).toBe(1000);
    fireEvent.changeText(box, 'Yes it is');
    fireEvent.press(screen.getByText('Post answer'));
    await waitFor(() => expect(svc.answerQuestion).toHaveBeenCalledWith('q1', 'Yes it is'));
    await waitFor(() => expect(svc.fetchProductQA).toHaveBeenCalledTimes(2));
  });

  it('hides Answer when the user may not answer', async () => {
    renderQA();
    await ready();
    expect(screen.queryByLabelText('Answer this question')).toBeNull();
  });

  it('shows Delete only on my own posts, and only after confirming', async () => {
    svc.deleteQuestion.mockResolvedValue(undefined);
    confirmAction.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    svc.fetchProductQA.mockResolvedValue(
      qa({ questions: [question(1, { isMine: true }), question(2)] })
    );
    renderQA();
    await ready();
    expect(screen.getAllByLabelText('Delete question')).toHaveLength(1);

    fireEvent.press(screen.getByLabelText('Delete question'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(svc.deleteQuestion).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Delete question'));
    await waitFor(() => expect(svc.deleteQuestion).toHaveBeenCalledWith('q1'));
    await waitFor(() => expect(svc.fetchProductQA).toHaveBeenCalledTimes(2));
  });

  it('lets staff delete every question and answer', async () => {
    svc.fetchProductQA.mockResolvedValue(
      qa({
        permissions: { canAsk: true, canAnswer: true, isStaff: true },
        questions: [question(1, { answers: [answer(), answer({ id: 'a2', isStaff: false, answerer: 'Ben T.' })] })],
      })
    );
    renderQA();
    await ready();
    expect(screen.getAllByLabelText('Delete question')).toHaveLength(1);
    expect(screen.getAllByLabelText('Delete answer')).toHaveLength(2);
  });
});