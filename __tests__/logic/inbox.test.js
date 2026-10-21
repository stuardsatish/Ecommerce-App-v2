// src/services/inbox.js - the customer's in-app inbox + device-token registration, written against the REAL columns / RPCs of migration 20261008_04
// (kind / read_at, mark_notifications_read, register_device_token, unregister_device_token). The first version of the app used type / is_read and wrote
// device_tokens directly: the inbox was always empty and no push token was ever stored (known issue K-7 / P-11) - these tests pin the fix.
// The Supabase client is injected, so a fake stands in; nothing here touches the network.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const { createInboxService } = require('@/services/inbox');
const { NOTIFICATION_COLUMNS } = require('@/utils/notificationModel');
const { currentPushToken, rememberPushToken } = require('@/services/pushToken');

function builder(result, log) {
  const b = {};
  for (const m of ['select', 'order', 'limit']) {
    b[m] = (...args) => {
      log.push(['notifications', m, ...args]);
      return b;
    };
  }
  b.then = (res, rej) => Promise.resolve(result).then(res, rej);
  return b;
}
function fakeClient({ rows = { data: [], error: null }, rpcs = {} } = {}) {
  const log = [];
  return {
    log,
    from: (t) => {
      log.push(['from', t]);
      return builder(rows, log);
    },
    rpc: async (name, args) => {
      log.push(['rpc', name, args]);
      const r = rpcs[name];
      return r !== undefined ? r : { data: null, error: null };
    },
  };
}

describe('list', () => {
  it('reads the real columns, newest first, and maps the rows (read_at -> read, kind, data.type)', async () => {
    const c = fakeClient({
      rows: {
        data: [
          { id: 'n2', kind: 'order_update', title: 'Your refund is complete', body: 'RFD-1', data: { type: 'refund', requestId: 'r1' }, created_at: '2026-10-18T10:00:00Z', read_at: null },
          { id: 'n1', kind: 'back_in_stock', title: 'Back in stock', body: 'Mug', data: { type: 'product', productId: 'p1' }, created_at: '2026-10-17T10:00:00Z', read_at: '2026-10-17T11:00:00Z' },
        ],
        error: null,
      },
    });
    const list = await createInboxService(c).list({ limit: 20 });
    expect(c.log).toEqual([
      ['from', 'notifications'],
      ['notifications', 'select', NOTIFICATION_COLUMNS],
      ['notifications', 'order', 'created_at', { ascending: false }],
      ['notifications', 'limit', 20],
    ]);
    expect(NOTIFICATION_COLUMNS).not.toMatch(/is_read|\btype\b/); // the columns that never existed
    expect(list.map((n) => [n.id, n.kind, n.type, n.read])).toEqual([['n2', 'order_update', 'refund', false], ['n1', 'back_in_stock', 'product', true]]);
  });
  it('defaults to 30 rows; an empty table is an empty list', async () => {
    const c = fakeClient();
    expect(await createInboxService(c).list()).toEqual([]);
    expect(c.log[3]).toEqual(['notifications', 'limit', 30]);
  });
  it('a database error is thrown (the wrappers in notifications.js log it and show an empty inbox)', async () => {
    const c = fakeClient({ rows: { data: null, error: { code: '42703', message: 'column notifications.type does not exist' } } });
    await expect(createInboxService(c).list()).rejects.toMatchObject({ code: '42703' });
  });
});

describe('markRead', () => {
  it('marks the given ids through mark_notifications_read (the only write a customer may make); returns the count', async () => {
    const c = fakeClient({ rpcs: { mark_notifications_read: { data: 2, error: null } } });
    expect(await createInboxService(c).markRead(['n1', 'n2'])).toBe(2);
    expect(c.log).toEqual([['rpc', 'mark_notifications_read', { p_ids: ['n1', 'n2'] }]]);
  });
  it('no ids (or anything that is not an array) = every unread notification (p_ids null)', async () => {
    for (const arg of [undefined, null, 'n1']) {
      const c = fakeClient({ rpcs: { mark_notifications_read: { data: 5, error: null } } });
      expect(await createInboxService(c).markRead(arg)).toBe(5);
      expect(c.log[0]).toEqual(['rpc', 'mark_notifications_read', { p_ids: null }]);
    }
  });
  it('a non-numeric answer counts as 0; an error is thrown', async () => {
    expect(await createInboxService(fakeClient({ rpcs: { mark_notifications_read: { data: null, error: null } } })).markRead(['n1'])).toBe(0);
    await expect(createInboxService(fakeClient({ rpcs: { mark_notifications_read: { data: null, error: { message: 'boom' } } } })).markRead(['n1'])).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('device tokens', () => {
  it('registerToken goes through register_device_token with the names the RPC has', async () => {
    const c = fakeClient();
    await createInboxService(c).registerToken({ token: 'ExponentPushToken[abc]', platform: 'ios', deviceName: 'iPhone', appVersion: '1.0.0' });
    expect(c.log).toEqual([['rpc', 'register_device_token', { p_token: 'ExponentPushToken[abc]', p_platform: 'ios', p_device_name: 'iPhone', p_app_version: '1.0.0' }]]);
  });
  it('device name and version are optional', async () => {
    const c = fakeClient();
    await createInboxService(c).registerToken({ token: 'ExponentPushToken[abc]', platform: 'android' });
    expect(c.log[0][2]).toEqual({ p_token: 'ExponentPushToken[abc]', p_platform: 'android', p_device_name: null, p_app_version: null });
  });
  it('unregisterToken goes through unregister_device_token', async () => {
    const c = fakeClient();
    await createInboxService(c).unregisterToken('ExponentPushToken[abc]');
    expect(c.log).toEqual([['rpc', 'unregister_device_token', { p_token: 'ExponentPushToken[abc]' }]]);
  });
  it('the database refusing a token (bad token / platform) is thrown', async () => {
    const c = fakeClient({ rpcs: { register_device_token: { data: null, error: { code: '22023', message: 'Invalid device token' } } } });
    await expect(createInboxService(c).registerToken({ token: 'x', platform: 'ios' })).rejects.toMatchObject({ code: '22023' });
    const d = fakeClient({ rpcs: { unregister_device_token: { data: null, error: { message: 'boom' } } } });
    await expect(createInboxService(d).unregisterToken('t')).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('pushToken memory (read by the sign-out flow before the session ends)', () => {
  it('remembers the registered token and forgets it', () => {
    expect(currentPushToken()).toBe(null);
    rememberPushToken('ExponentPushToken[abc]');
    expect(currentPushToken()).toBe('ExponentPushToken[abc]');
    rememberPushToken(null);
    expect(currentPushToken()).toBe(null);
    rememberPushToken('');
    expect(currentPushToken()).toBe(null);
  });
});