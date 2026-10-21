// Port of Ecommerce-Website-v2-main/src/services/returns/__tests__/returnsService.test.mjs (the part the RN twin has: the CUSTOMER calls).
// src/services/returns.js is the RN twin of the website's returnsService.js - same function names, same rules; change one, change both.
// The supabase client is injected into createReturnsService(), so a fake client stands in (defined below, as in the web fakeClient.mjs).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const { createReturnsService, toReturnsError, isReturnsUnavailable, EVIDENCE_BUCKET } = require('@/services/returns');

/** chainable + awaitable stand-in for a supabase query builder */
function builder(result, log, table) {
  const b = {};
  for (const m of ['select', 'order', 'eq', 'in', 'limit', 'single']) {
    b[m] = (...args) => {
      log.push([table, m, ...args]);
      return b;
    };
  }
  b.then = (res, rej) => Promise.resolve(result).then(res, rej);
  return b;
}
function fakeClient({ tables = {}, rpcs = {}, storage = {} } = {}) {
  const log = [];
  const bucket = {
    upload: async (path, body, opts) => {
      log.push(['upload', path, opts]);
      return storage.uploadError && storage.uploadError(path) ? { error: storage.uploadError(path) } : { error: null };
    },
    remove: async (paths) => {
      log.push(['remove', paths]);
      return { error: null };
    },
    createSignedUrls: async (paths, exp) => {
      log.push(['sign', paths, exp]);
      return storage.signed || { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null };
    },
  };
  return {
    log,
    from: (t) => builder(tables[t] !== undefined ? tables[t] : { data: [], error: null }, log, t),
    rpc: async (name, args) => {
      log.push(['rpc', name, args]);
      const r = rpcs[name];
      return typeof r === 'function' ? r(args) : r !== undefined ? r : { data: null, error: null };
    },
    storage: {
      from: (b) => {
        log.push(['bucket', b]);
        return bucket;
      },
    },
  };
}
const photo = (name, o = {}) => ({ name, type: 'image/jpeg', size: 1000, body: new Uint8Array(4), ...o });

describe('error mapping', () => {
  it('keeps the database message; translates the infrastructure cases', () => {
    expect(toReturnsError({ message: 'Only 1 unit(s) of "Shirt" can still be returned', code: '22023' }).message).toBe('Only 1 unit(s) of "Shirt" can still be returned');
    expect(toReturnsError({ code: 'PGRST202', message: 'x' }).message).toMatch(/not available on the server yet/);
    expect(toReturnsError({ code: '23505', message: 'duplicate key' }).message).toBe('A request for one of these items already exists.');
    expect(toReturnsError({ code: '42501', message: 'permission denied for function x' }).message).toBe('You do not have permission to do that.');
    expect(toReturnsError({}).message).toBe('Something went wrong');
    expect(toReturnsError({ code: '22023', details: 'ACTIVE_REQUEST', message: 'm' }).detail).toBe('ACTIVE_REQUEST');
  });
  it('recognises a server without the returns feature', () => {
    for (const e of [{ code: 'PGRST202' }, { code: 'PGRST205' }, { code: '42883' }, { code: '42P01' }, { code: '42703' }, { message: 'Could not find the function public.get_order_eligibility(p_order_id)' },
      { message: 'relation "public.return_requests" does not exist' }]) expect(isReturnsUnavailable(e)).toBe(true);
    expect(isReturnsUnavailable({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isReturnsUnavailable(null)).toBe(false);
  });
});

describe('customer calls', () => {
  it('eligibility: the RPC answer; null when the feature is not on the server; other errors throw', async () => {
    const okc = fakeClient({ rpcs: { get_order_eligibility: { data: { items: [] }, error: null } } });
    expect(await createReturnsService(okc).eligibility('o1')).toEqual({ items: [] });
    expect(okc.log[0]).toEqual(['rpc', 'get_order_eligibility', { p_order_id: 'o1' }]);
    const missing = fakeClient({ rpcs: { get_order_eligibility: { data: null, error: { code: 'PGRST202', message: 'x' } } } });
    expect(await createReturnsService(missing).eligibility('o1')).toBeNull();
    const denied = fakeClient({ rpcs: { get_order_eligibility: { data: null, error: { code: 'P0002', message: 'Order not found' } } } });
    await expect(createReturnsService(denied).eligibility('o1')).rejects.toThrow(/Order not found/);
  });
  it('reasons: rows; [] when the table is missing', async () => {
    const c = fakeClient({ tables: { request_reasons: { data: [{ code: 'damaged' }], error: null } } });
    expect(await createReturnsService(c).reasons()).toEqual([{ code: 'damaged' }]);
    const m = fakeClient({ tables: { request_reasons: { data: null, error: { code: '42P01', message: 'x' } } } });
    expect(await createReturnsService(m).reasons()).toEqual([]);
  });
  it('uploadEvidence: puts every photo in <uid>/<request>/ of the PRIVATE bucket and returns what the RPC needs', async () => {
    const c = fakeClient();
    const out = await createReturnsService(c).uploadEvidence({ uid: 'u1', requestId: 'r1', files: [photo('a b.jpg'), photo('c.png', { type: 'image/png' })] });
    expect(out).toEqual([{ path: 'u1/r1/1-a-b.jpg', mime: 'image/jpeg', size: 1000 }, { path: 'u1/r1/2-c.png', mime: 'image/png', size: 1000 }]);
    expect(c.log.some((l) => l[0] === 'bucket' && l[1] === EVIDENCE_BUCKET)).toBe(true);
    expect(c.log.filter((l) => l[0] === 'upload').map((l) => l[2])).toEqual([{ contentType: 'image/jpeg', upsert: false }, { contentType: 'image/png', upsert: false }]);
    expect(EVIDENCE_BUCKET).toBe('return-evidence');
  });
  it('uploadEvidence: extra photos continue the numbering (never reuse a stored file name) and still respect the 6 photo limit', async () => {
    const c = fakeClient();
    const out = await createReturnsService(c).uploadEvidence({ uid: 'u1', requestId: 'r1', files: [photo('a.jpg')], startIndex: 2 });
    expect(out[0].path).toBe('u1/r1/3-a.jpg');
    await expect(createReturnsService(fakeClient()).uploadEvidence({ uid: 'u', requestId: 'r', files: [photo('a.jpg'), photo('b.jpg')], startIndex: 5 })).rejects.toThrow(/At most 6/);
  });
  it('uploadEvidence: refuses bad files before uploading anything, and rolls back when one upload fails', async () => {
    const svc = (c) => createReturnsService(c);
    const c1 = fakeClient();
    await expect(svc(c1).uploadEvidence({ uid: 'u', requestId: 'r', files: [photo('a.jpg'), photo('b.pdf', { type: 'application/pdf' })] })).rejects.toThrow(/JPEG, PNG or WebP/);
    expect(c1.log.filter((l) => l[0] === 'upload').length).toBe(0); // nothing was uploaded
    await expect(svc(fakeClient()).uploadEvidence({ uid: 'u', requestId: 'r', files: Array.from({ length: 7 }, (_, i) => photo(`p${i}.jpg`)) })).rejects.toThrow(/At most 6/);
    const c2 = fakeClient({ storage: { uploadError: (p) => (p.includes('/2-') ? { message: 'bucket full' } : null) } });
    await expect(svc(c2).uploadEvidence({ uid: 'u', requestId: 'r', files: [photo('a.jpg'), photo('b.jpg')] })).rejects.toThrow(/bucket full/);
    expect(c2.log.find((l) => l[0] === 'remove')[1]).toEqual(['u/r/1-a.jpg']); // the photo that did go up is removed again
    expect(await svc(fakeClient()).uploadEvidence({ uid: 'u', requestId: 'r', files: [] })).toEqual([]);
  });
  it('submit / cancel / respond / tracking call their RPCs and map the answer', async () => {
    const c = fakeClient({ rpcs: {
      create_return_request: { data: { ok: true, created: true, request_id: 'r1', request_no: 'RET-2026-000001', status: 'pending_review' }, error: null },
      cancel_return_request: { data: { ok: true, already: false, status: 'cancelled' }, error: null },
      respond_to_request: { data: { ok: true, status: 'pending_review' }, error: null },
      customer_submit_return_shipment: { data: { ok: true, status: 'return_in_transit', shipment_id: 's1' }, error: null },
    } });
    const svc = createReturnsService(c);
    expect(await svc.submit({ p_request_id: 'r1' })).toEqual({ created: true, requestId: 'r1', requestNo: 'RET-2026-000001', status: 'pending_review' });
    expect(await svc.cancel('r1', 'changed my mind')).toEqual({ already: false, status: 'cancelled' });
    expect(await svc.respond('r1', 'here', [{ path: 'p' }])).toEqual({ status: 'pending_review' });
    expect(await svc.submitReturnTracking({ requestId: 'r1', courierName: 'India Post', trackingNumber: 'RR1' })).toEqual({ status: 'return_in_transit', shipmentId: 's1' });
    expect(c.log[2]).toEqual(['rpc', 'respond_to_request', { p_request_id: 'r1', p_message: 'here', p_evidence: [{ path: 'p' }] }]);
    expect(c.log[3][2]).toEqual({ p_request_id: 'r1', p_courier_name: 'India Post', p_tracking_number: 'RR1', p_tracking_url: null, p_shipped_at: null });
  });
  it('an RPC error becomes a thrown Error with the database message', async () => {
    const c = fakeClient({ rpcs: { create_return_request: { data: null, error: { code: '22023', message: 'Please add at least one photo (required for this reason)' } } } });
    let err;
    try {
      await createReturnsService(c).submit({});
    } catch (e) {
      err = e;
    }
    expect(err.message.startsWith('Please add at least one photo')).toBe(true);
    expect(err.code).toBe('22023');
  });
  it('lists map rows; a missing table is an empty list', async () => {
    const row = { id: 'r1', request_no: 'RET-1', order_id: 'o1', type: 'return', status: 'approved', reason_code: 'damaged' };
    const c = fakeClient({ tables: { return_requests: { data: [row], error: null } } });
    expect((await createReturnsService(c).listForOrder('o1')).map((r) => r.requestNo)).toEqual(['RET-1']);
    expect(c.log.some((l) => l[1] === 'eq' && l[2] === 'order_id' && l[3] === 'o1')).toBe(true);
    expect(c.log.some((l) => l[1] === 'select' && String(l[2]).includes('return_request_events(id, item_id') && !String(l[2]).includes('return_request_private'))).toBe(true);
    expect((await createReturnsService(c).listMine()).length).toBe(1);
    const m = fakeClient({ tables: { return_requests: { data: null, error: { code: 'PGRST205', message: 'x' } } } });
    expect(await createReturnsService(m).listMine()).toEqual([]);
  });
  it('signed links for the private photos', async () => {
    const c = fakeClient();
    expect(await createReturnsService(c).signedEvidenceUrls(['u/r/1-a.jpg'])).toEqual({ 'u/r/1-a.jpg': 'https://signed/u/r/1-a.jpg' });
    expect(c.log.find((l) => l[0] === 'sign')).toEqual(['sign', ['u/r/1-a.jpg'], 3600]);
    expect(await createReturnsService(c).signedEvidenceUrls([])).toEqual({});
  });
  it('refunds of requests: the customer columns only, mapped; [] for no ids or a server without the feature', async () => {
    const c = fakeClient({ tables: { refunds: { data: [{ id: 'f1', refund_no: 'RFD-1', order_id: 'o1', request_id: 'r1', amount: '100.00', method: 'manual', status: 'pending' }], error: null } } });
    const out = await createReturnsService(c).refundsForRequests(['r1']);
    expect([out[0].refundNo, out[0].amount, out[0].status, out[0].requestId]).toEqual(['RFD-1', 100, 'pending', 'r1']);
    expect(c.log.some((l) => l[0] === 'refunds' && l[1] === 'in' && l[2] === 'request_id')).toBe(true);
    expect(c.log.some((l) => l[0] === 'refunds' && l[1] === 'select' && !String(l[2]).includes('gateway') && !String(l[2]).includes('refund_private') && String(l[2]).includes('failure_reason'))).toBe(true);
    expect(await createReturnsService(fakeClient()).refundsForRequests([])).toEqual([]);
    const m = fakeClient({ tables: { refunds: { data: null, error: { code: 'PGRST205', message: 'x' } } } });
    expect(await createReturnsService(m).refundsForRequests(['r1'])).toEqual([]);
    const denied = fakeClient({ tables: { refunds: { data: null, error: { code: '42501', message: 'permission denied for table refunds' } } } });
    await expect(createReturnsService(denied).refundsForRequests(['r1'])).rejects.toThrow(/permission/);
  });
  it('order-level refunds and the cancellation of ONE order: the customer columns (with the reason), never the staff side; empty / null without the feature', async () => {
    const c = fakeClient({
      tables: {
        refunds: { data: [{ id: 'f1', refund_no: 'RFD-1', order_id: 'o1', request_id: null, kind: 'order', amount: '1100.00', method: 'razorpay', status: 'pending', reason: 'your cancelled order' }], error: null },
        order_cancellations: { data: [{ order_id: 'o1', reason: 'We cannot supply it', refund_id: 'f1', cancelled_at: '2026-10-18T10:00:00Z' }], error: null },
      },
    });
    const svc = createReturnsService(c);
    const refunds = await svc.refundsForOrder('o1');
    expect([refunds[0].kind, refunds[0].reason, refunds[0].amount, refunds[0].requestId]).toEqual(['order', 'your cancelled order', 1100, null]);
    expect(c.log.some((l) => l[0] === 'refunds' && l[1] === 'eq' && l[2] === 'kind' && l[3] === 'order')).toBe(true);
    expect(c.log.some((l) => l[0] === 'refunds' && l[1] === 'select' && String(l[2]).endsWith(', reason') && !/gateway|private/.test(String(l[2])))).toBe(true);
    expect(await svc.cancellationForOrder('o1')).toEqual({ orderId: 'o1', reason: 'We cannot supply it', refundId: 'f1', cancelledAt: '2026-10-18T10:00:00Z' });
    expect(c.log.some((l) => l[0] === 'order_cancellations' && l[1] === 'select' && !/private|cancelled_by|internal/.test(String(l[2])))).toBe(true);
    expect(await svc.refundsForOrder('')).toEqual([]);
    expect(await svc.cancellationForOrder(null)).toBeNull();
    expect(await createReturnsService(fakeClient()).cancellationForOrder('o9')).toBeNull();
    // a server without the cancellation migration: the missing table / column means "nothing", any other error is thrown
    const old = fakeClient({ tables: { refunds: { data: null, error: { code: '42703', message: 'column refunds.reason does not exist' } }, order_cancellations: { data: null, error: { code: 'PGRST205', message: 'x' } } } });
    expect(await createReturnsService(old).refundsForOrder('o1')).toEqual([]);
    expect(await createReturnsService(old).cancellationForOrder('o1')).toBeNull();
    const denied = fakeClient({ tables: { order_cancellations: { data: null, error: { code: '42501', message: 'permission denied for table order_cancellations' } } } });
    await expect(createReturnsService(denied).cancellationForOrder('o1')).rejects.toThrow(/permission/);
  });
  it('replacements of exchanges: the record, the price difference and the live parcel by request; never the reservations or the staff notes', async () => {
    const c = fakeClient({
      tables: {
        replacement_fulfillments: { data: [{ id: 'f1', request_id: 'r1', order_id: 'o1', status: 'shipped', shipment_id: 's2', replacement_fulfillment_items: [{ id: 'fi1', title: 'Shirt', variant_name: 'White', quantity: 1 }] }], error: null },
        exchange_adjustments: { data: [{ request_id: 'r1', kind: 'refund_due', amount: '100.00', status: 'open' }], error: null },
        shipments: { data: [{ id: 's1', direction: 'replacement', request_id: 'r1', status: 'cancelled', created_at: '2026-10-18T10:00:00Z' }, { id: 's2', direction: 'replacement', request_id: 'r1', status: 'in_transit', tracking_number: 'T1', created_at: '2026-10-18T12:00:00Z' }], error: null },
      },
    });
    const out = await createReturnsService(c).replacementsFor(['r1']);
    expect(Object.keys(out)).toEqual(['r1']);
    expect([out.r1.fulfilment.status, out.r1.fulfilment.lines[0].variantName, out.r1.adjustment.kind, out.r1.adjustment.amount, out.r1.shipment.id, out.r1.shipment.trackingNumber]).toEqual(['shipped', 'White', 'refund_due', 100, 's2', 'T1']);
    expect(c.log.some((l) => l[0] === 'replacement_fulfillments' && l[1] === 'in' && l[2] === 'request_id')).toBe(true);
    expect(c.log.some((l) => l[0] === 'shipments' && l[1] === 'eq' && l[2] === 'direction' && l[3] === 'replacement')).toBe(true);
    // customer columns only: no staff reference / note, no reservations table, no shipment_private
    expect(c.log.some((l) => l[0] === 'exchange_adjustments' && l[1] === 'select' && !/reference|internal|private/.test(String(l[2])))).toBe(true);
    expect(c.log.some((l) => l[0] === 'exchange_reservations')).toBe(false);
    expect(c.log.some((l) => l[0] === 'shipments' && l[1] === 'select' && String(l[2]).includes('shipment_private'))).toBe(false);
    expect(await createReturnsService(fakeClient()).replacementsFor([])).toEqual({});
    expect(await createReturnsService(fakeClient()).replacementsFor(null)).toEqual({});
    // a server without the exchange tables: nothing (the feature stays hidden); any other error is thrown
    const m = fakeClient({ tables: { replacement_fulfillments: { data: null, error: { code: 'PGRST205', message: 'x' } } } });
    expect(await createReturnsService(m).replacementsFor(['r1'])).toEqual({});
    const denied = fakeClient({ tables: { exchange_adjustments: { data: null, error: { code: '42501', message: 'permission denied for table exchange_adjustments' } } } });
    await expect(createReturnsService(denied).replacementsFor(['r1'])).rejects.toThrow(/permission/);
  });
  it('the customer view of return parcels never selects the admin-only table', async () => {
    const c = fakeClient({ tables: { shipments: { data: [{ id: 's1', direction: 'return', request_id: 'r1' }], error: null } } });
    const out = await createReturnsService(c).returnShipmentsFor(['r1']);
    expect(out[0].requestId).toBe('r1');
    expect(c.log.some((l) => l[1] === 'select' && !String(l[2]).includes('shipment_private') && String(l[2]).includes('shipment_events(id, event_type'))).toBe(true);
    expect(await createReturnsService(fakeClient()).returnShipmentsFor([])).toEqual([]);
  });
});