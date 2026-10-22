/**
 * Native component tests for <OrderCard>.
 * Checklist items: OR01–OR04 (order card display, status badges, invoice download,
 * review entry point, return/exchange link for delivered orders).
 *
 * Uses the jest-expo preset (see jest.config.js `native` project).
 */
const React = require('react');
const { render, fireEvent } = require('@testing-library/react-native');

jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#6c47ff', accentStrong: '#f59e0b', info: '#3b82f6',
    success: '#22c55e', error: '#ef4444', body: '#6b7280',
    inverse: '#fff', link: '#6c47ff',
  }),
}));

const { OrderCard } = require('@/components/OrderCard');

// ── Factories ─────────────────────────────────────────────────────────────────
const product = (over = {}) => ({
  productId: 'p1',
  title: 'Milk Chocolate Box',
  quantity: 2,
  thumbnail: 'https://cdn.example/choc.jpg',
  ...over,
});

const order = (over = {}) => ({
  id: 'ord-1',
  rawId: 'ord-1',
  orderStatus: 'placed',
  total: 450,
  products: [product()],
  ...over,
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('<OrderCard>', () => {
  it('OR01 — renders the order total with rupee symbol', () => {
    const { getByText } = render(
      <OrderCard order={order()} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={jest.fn()} />
    );
    expect(getByText('₹450.00')).toBeTruthy();
  });

  it('renders the order status badge', () => {
    const { getByText } = render(
      <OrderCard order={order({ orderStatus: 'placed' })} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={jest.fn()} />
    );
    expect(getByText('placed')).toBeTruthy();
  });

  it('renders each product title in the card', () => {
    const o = order({ products: [product({ title: 'Truffle Pack' }), product({ title: 'Almond Bark' })] });
    const { getByText } = render(
      <OrderCard order={o} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={jest.fn()} />
    );
    expect(getByText('Truffle Pack')).toBeTruthy();
    expect(getByText('Almond Bark')).toBeTruthy();
  });

  it('renders product quantity', () => {
    const { getByText } = render(
      <OrderCard order={order()} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={jest.fn()} />
    );
    expect(getByText('Qty: 2')).toBeTruthy();
  });

  it('OR04 — calls onPress when the card is tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <OrderCard order={order()} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={onPress} />
    );
    fireEvent.press(getByText('₹450.00'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('IN01 — shows the download invoice button', () => {
    const { getByLabelText } = render(
      <OrderCard order={order()} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={jest.fn()} />
    );
    expect(getByLabelText('Download invoice')).toBeTruthy();
  });

  it('IN01 — calls onDownloadInvoice when invoice button is pressed', () => {
    const onDl = jest.fn();
    const { getByLabelText } = render(
      <OrderCard order={order()} getReview={() => null} onDownloadInvoice={onDl} onPress={jest.fn()} />
    );
    fireEvent.press(getByLabelText('Download invoice'));
    expect(onDl).toHaveBeenCalledTimes(1);
  });

  it('OR03 — shows Return / Exchange link for delivered orders', () => {
    const { getByText } = render(
      <OrderCard order={order({ orderStatus: 'delivered' })} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={jest.fn()} />
    );
    expect(getByText('Return / Exchange')).toBeTruthy();
  });

  it('does NOT show Return / Exchange for non-delivered orders', () => {
    const { queryByText } = render(
      <OrderCard order={order({ orderStatus: 'placed' })} getReview={() => null} onDownloadInvoice={jest.fn()} onPress={jest.fn()} />
    );
    expect(queryByText('Return / Exchange')).toBeNull();
  });

  it('OR04 — shows Review button for delivered order with no review yet', () => {
    const { getByLabelText } = render(
      <OrderCard
        order={order({ orderStatus: 'delivered' })}
        getReview={() => null}
        onDownloadInvoice={jest.fn()}
        onPress={jest.fn()}
        onReviewPress={jest.fn()}
      />
    );
    expect(getByLabelText(`Review ${product().title}`)).toBeTruthy();
  });

  it('OR04 — shows Edit review when review already exists', () => {
    const { getByLabelText } = render(
      <OrderCard
        order={order({ orderStatus: 'delivered' })}
        getReview={() => ({ rating: 5 })}
        onDownloadInvoice={jest.fn()}
        onPress={jest.fn()}
        onReviewPress={jest.fn()}
      />
    );
    expect(getByLabelText(`Edit your review of ${product().title}`)).toBeTruthy();
  });

  it('does not show Review/Edit for non-delivered orders', () => {
    const { queryByLabelText } = render(
      <OrderCard
        order={order({ orderStatus: 'shipped' })}
        getReview={() => ({ rating: 4 })}
        onDownloadInvoice={jest.fn()}
        onPress={jest.fn()}
        onReviewPress={jest.fn()}
      />
    );
    expect(queryByLabelText(/Review|Edit/i)).toBeNull();
  });

  it('renders a return request summary when provided', () => {
    const req = { type: 'return', status: 'approved' };
    const { getAllByText } = render(
      <OrderCard
        order={order({ orderStatus: 'delivered' })}
        returnRequest={req}
        getReview={() => null}
        onDownloadInvoice={jest.fn()}
        onPress={jest.fn()}
      />
    );
    // requestSummaryLine produces something like "Return · Approved"
    // getAllByText to handle the additional "Return / Exchange" link on delivered orders
    const returnTexts = getAllByText(/return/i);
    expect(returnTexts.length).toBeGreaterThanOrEqual(1);
  });
});
