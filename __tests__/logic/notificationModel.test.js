// Port (1:1) of Ecommerce-Website-v2-main/src/features/notifications/__tests__/notificationModel.test.mjs.
// src/utils/notificationModel.js is a byte-identical COPY of the web module; this file keeps the two in sync - change one, change both.
const {
  ADMIN_DATA_TYPES, CUSTOMER_DATA_TYPES, NOTIFICATION_COLUMNS, NOTIFICATION_KINDS, isAdminNotification, mapNotificationRow, mapNotificationRows,
  notificationIconKey, notificationRoute, routeForPushData, timeAgo, unreadCount,
} = require('@/utils/notificationModel');

const row = (over = {}) => ({ id: 'n1', kind: 'order_update', title: 'Order confirmed', body: 'We have confirmed your order #ABCD1234.', data: { type: 'order', orderId: 'order_1' }, created_at: '2026-10-18T08:00:00Z', read_at: null, ...over });

describe('mapNotificationRow', () => {
  it('maps the columns of public.notifications; read_at decides read', () => {
    expect(NOTIFICATION_COLUMNS).toBe('id, kind, title, body, data, created_at, read_at');
    const n = mapNotificationRow(row());
    expect(n).toEqual({ id: 'n1', kind: 'order_update', title: 'Order confirmed', body: 'We have confirmed your order #ABCD1234.', data: { type: 'order', orderId: 'order_1' }, type: 'order', createdAt: '2026-10-18T08:00:00Z', readAt: null, read: false });
    expect(mapNotificationRow(row({ read_at: '2026-10-18T09:00:00Z' })).read).toBe(true);
    expect(mapNotificationRow(row({ read_at: '2026-10-18T09:00:00Z' })).readAt).toBe('2026-10-18T09:00:00Z');
  });
  it('tolerates a null / array / unparsable data, a JSON string, a missing kind, title and body', () => {
    expect(mapNotificationRow(row({ data: null })).data).toEqual({});
    expect(mapNotificationRow(row({ data: [1, 2] })).data).toEqual({});
    expect(mapNotificationRow(row({ data: '{not json' })).data).toEqual({});
    expect(mapNotificationRow(row({ data: '[1]' })).data).toEqual({});
    expect(mapNotificationRow(row({ data: '{"type":"product","productId":"p1"}' })).data).toEqual({ type: 'product', productId: 'p1' });
    expect(mapNotificationRow(row({ data: '{"type":"product"}' })).type).toBe('product');
    const bare = mapNotificationRow({ id: 7 });
    expect([bare.id, bare.kind, bare.title, bare.body, bare.type, bare.read]).toEqual(['7', 'system', '', '', '', false]);
    expect(mapNotificationRow(row({ data: { type: 5 } })).type).toBe('');
  });
  it('drops rows without an id', () => {
    expect(mapNotificationRow(null)).toBe(null);
    expect(mapNotificationRow({})).toBe(null);
    expect(mapNotificationRows([row(), null, {}, row({ id: 'n2' })]).map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(mapNotificationRows(null)).toEqual([]);
  });
  it('lists the kinds and the data types the database writes', () => {
    expect(NOTIFICATION_KINDS).toEqual(['order_update', 'back_in_stock', 'price_drop', 'promotion', 'system']);
    expect(CUSTOMER_DATA_TYPES).toEqual(['order', 'product', 'return', 'exchange', 'refund', 'payment_exception']);
    expect(ADMIN_DATA_TYPES).toEqual(['admin_request', 'admin_refund', 'admin_payment_exception']);
  });
});

describe('unreadCount / isAdminNotification', () => {
  it('counts the unread mapped notifications', () => {
    const list = mapNotificationRows([row(), row({ id: 'n2', read_at: '2026-10-18T09:00:00Z' }), row({ id: 'n3' })]);
    expect(unreadCount(list)).toBe(2);
    expect(unreadCount([])).toBe(0);
    expect(unreadCount(null)).toBe(0);
    expect(unreadCount([null, undefined])).toBe(0);
  });
  it('an admin message is one whose data.type starts with admin_', () => {
    for (const t of ADMIN_DATA_TYPES) expect(isAdminNotification({ data: { type: t } })).toBe(true);
    for (const t of CUSTOMER_DATA_TYPES) expect(isAdminNotification({ data: { type: t } })).toBe(false);
    expect(isAdminNotification(mapNotificationRow(row({ kind: 'system', data: { type: 'admin_request' } })))).toBe(true);
    expect(isAdminNotification(null)).toBe(false);
    expect(isAdminNotification({})).toBe(false);
  });
});

describe('notificationIconKey', () => {
  const cases = [
    [{ kind: 'order_update', data: { type: 'order' } }, 'order'],
    [{ kind: 'order_update', data: { type: 'return' } }, 'return'],
    [{ kind: 'order_update', data: { type: 'exchange' } }, 'exchange'],
    [{ kind: 'order_update', data: { type: 'refund' } }, 'refund'],
    [{ kind: 'back_in_stock', data: { type: 'product' } }, 'stock'],
    [{ kind: 'price_drop', data: { type: 'product' } }, 'price'],
    [{ kind: 'order_update', data: { type: 'payment_exception' } }, 'alert'],
    [{ kind: 'system', data: { type: 'admin_payment_exception' } }, 'alert'],
    [{ kind: 'system', data: { type: 'admin_request' } }, 'admin'],
    [{ kind: 'system', data: { type: 'admin_refund' } }, 'admin'],
    // no / unknown type: the kind decides
    [{ kind: 'order_update', data: {} }, 'order'],
    [{ kind: 'back_in_stock', data: {} }, 'stock'],
    [{ kind: 'price_drop', data: null }, 'price'],
    [{ kind: 'promotion', data: {} }, 'promo'],
    [{ kind: 'system', data: { type: 'something_new' } }, 'bell'],
    [{ kind: 'something_new' }, 'bell'],
    [null, 'bell'],
  ];
  it.each(cases)('%j -> %s', (n, key) => {
    expect(notificationIconKey(n)).toBe(key);
  });
  it('works on a mapped notification too', () => {
    expect(notificationIconKey(mapNotificationRow(row({ data: { type: 'refund' } })))).toBe('refund');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  it('says it in the unit that fits', () => {
    expect(timeAgo(ago(0), now)).toBe('Just now');
    expect(timeAgo(ago(59 * 1000), now)).toBe('Just now');
    expect(timeAgo(ago(60 * 1000), now)).toBe('1m ago');
    expect(timeAgo(ago(59 * 60 * 1000), now)).toBe('59m ago');
    expect(timeAgo(ago(60 * 60 * 1000), now)).toBe('1h ago');
    expect(timeAgo(ago(23 * 3600 * 1000 + 59 * 60 * 1000), now)).toBe('23h ago');
    expect(timeAgo(ago(24 * 3600 * 1000), now)).toBe('1d ago');
    expect(timeAgo(ago(29 * 24 * 3600 * 1000), now)).toBe('29d ago');
  });
  it('a clock a little ahead of the server still reads "Just now"; later than 30 days is a date; garbage is empty', () => {
    expect(timeAgo(new Date(now + 5000).toISOString(), now)).toBe('Just now');
    expect(timeAgo('2026-08-01T00:00:00Z', now)).toMatch(/2026/);
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo('not a date', now)).toBe('');
  });
});

describe('notificationRoute', () => {
  const web = (data) => notificationRoute({ data }, 'web');
  const app = (data) => notificationRoute({ data }, 'app');
  it('an order notification opens the order on both platforms', () => {
    expect(web({ type: 'order', orderId: 'order_RZP1' })).toBe('/order/order_RZP1');
    expect(app({ type: 'order', orderId: 'order_RZP1' })).toBe('/orders/order_RZP1');
    expect(web({ type: 'order', orderId: 'cod_6f1c2d3e-0000-4000-8000-000000000001' })).toBe('/order/cod_6f1c2d3e-0000-4000-8000-000000000001');
    expect(web({ type: 'order' })).toBe(null);
  });
  it('a product notification opens the product', () => {
    expect(web({ type: 'product', productId: 'prod_1700000000001' })).toBe('/product/prod_1700000000001');
    expect(app({ type: 'product', productId: 'prod_1700000000001' })).toBe('/products/prod_1700000000001');
    expect(app({ type: 'product' })).toBe(null);
  });
  it('return / exchange requests open My Returns; a refund opens its request, or the order when it has none', () => {
    expect(web({ type: 'return', requestId: 'r1' })).toBe('/myreturns');
    expect(app({ type: 'return', requestId: 'r1' })).toBe('/returns');
    expect(web({ type: 'exchange' })).toBe('/myreturns');
    expect(app({ type: 'exchange' })).toBe('/returns');
    expect(web({ type: 'refund', requestId: 'r1', orderId: 'o1' })).toBe('/myreturns');
    expect(app({ type: 'refund', requestId: 'r1', orderId: 'o1' })).toBe('/returns');
    expect(web({ type: 'refund', requestId: null, orderId: 'o1' })).toBe('/order/o1');
    expect(app({ type: 'refund', orderId: 'o1' })).toBe('/orders/o1');
    expect(web({ type: 'refund' })).toBe(null);
  });
  it('admin messages lead to the admin pages on the website and nowhere in the app', () => {
    expect(web({ type: 'admin_request' })).toBe('/admin/returns');
    expect(web({ type: 'admin_refund' })).toBe('/admin/returns');
    expect(web({ type: 'admin_payment_exception' })).toBe('/admin/inventory');
    for (const t of ADMIN_DATA_TYPES) expect(app({ type: t })).toBe(null);
  });
  it('no destination: the customer\'s "could not complete your order", unknown types, no data, garbage', () => {
    expect(web({ type: 'payment_exception' })).toBe(null);
    expect(web({ type: 'brand_new' })).toBe(null);
    expect(web({})).toBe(null);
    expect(notificationRoute(null)).toBe(null);
    expect(notificationRoute({ data: null }, 'app')).toBe(null);
    expect(notificationRoute({ data: 'not json' }, 'app')).toBe(null);
    expect(notificationRoute({ data: '{"type":"order","orderId":"o9"}' }, 'web')).toBe('/order/o9');
  });
  it('an unknown platform behaves like the website', () => {
    expect(notificationRoute({ data: { type: 'order', orderId: 'o1' } }, 'tv')).toBe('/order/o1');
  });
  it('never builds a path from an id that does not look like one', () => {
    for (const bad of ['../../admin', 'a/b', 'a b', 'a?x=1', 'a#b', '', ' ', 'x'.repeat(129), '-leading', '<script>', 'é']) {
      expect(web({ type: 'order', orderId: bad })).toBe(null);
      expect(app({ type: 'product', productId: bad })).toBe(null);
    }
    expect(web({ type: 'order', orderId: { x: 1 } })).toBe(null);
    expect(web({ type: 'order', orderId: ['o1'] })).toBe(null);
    expect(web({ type: 'order', orderId: 12345 })).toBe('/order/12345');
  });
  it('every data.type the database writes is understood (has a route or deliberately none)', () => {
    const withRoute = { order: { orderId: 'o1' }, product: { productId: 'p1' }, return: {}, exchange: {}, refund: { requestId: 'r1' }, admin_request: {}, admin_refund: {}, admin_payment_exception: {} };
    for (const t of [...CUSTOMER_DATA_TYPES, ...ADMIN_DATA_TYPES]) {
      if (t === 'payment_exception') continue; // customer-side, deliberately no destination
      expect(web({ type: t, ...withRoute[t] })).toBeTruthy();
    }
  });
});

describe('routeForPushData', () => {
  it('a tapped push opens its destination in the app, else the inbox', () => {
    expect(routeForPushData({ type: 'order', orderId: 'o1', notificationId: 'n1' })).toBe('/orders/o1');
    expect(routeForPushData({ type: 'return', requestId: 'r1' })).toBe('/returns');
    expect(routeForPushData({ type: 'product', productId: 'p1' })).toBe('/products/p1');
    expect(routeForPushData({ type: 'payment_exception' })).toBe('/notifications');
    expect(routeForPushData({})).toBe('/notifications');
    expect(routeForPushData(undefined)).toBe('/notifications');
    expect(routeForPushData(null)).toBe('/notifications');
  });
  it('a payload without a type that names an order / a product still opens it (what the first push handler did); an order wins', () => {
    expect(routeForPushData({ orderId: 'o1' })).toBe('/orders/o1');
    expect(routeForPushData({ productId: 'p1' })).toBe('/products/p1');
    expect(routeForPushData({ orderId: 'o1', productId: 'p1' })).toBe('/orders/o1');
    expect(routeForPushData({ orderId: '../x' })).toBe('/notifications');
    expect(routeForPushData({ type: 'something_new', orderId: 'o1' })).toBe('/notifications'); // a type this build does not know: do not guess
  });
});