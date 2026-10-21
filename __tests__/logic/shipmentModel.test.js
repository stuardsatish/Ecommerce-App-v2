// Port (1:1) of Ecommerce-Website-v2-main/src/features/orders/__tests__/shipmentModel.test.mjs.
// src/utils/shipmentModel.js is a byte-identical COPY of the web module; this file keeps the two in sync - change one, change both.
const {
  shipmentStatusMeta, eventLabel, mapShipmentRow, mapShipmentRows, customerEvents, activeShipments, summarizeTracking, trackingHeadline,
  trackingSteps, urlEncode, trackingUrlFromTemplate, isHttpUrl, remainingByLine, validateShipForm, ADMIN_EVENT_CHOICES, formatDay,
  SHIPMENT_STATUSES, SHIPMENT_EVENT_TYPES, SHIPMENTS_SELECT_CUSTOMER, SHIPMENTS_SELECT_ADMIN,
} = require('@/utils/shipmentModel');

const row = (o = {}) => ({
  id: 's1', order_id: 'o1', direction: 'outbound', courier_code: 'dtdc', courier_name: 'DTDC', tracking_number: 'AWB1', tracking_url: 'https://t.test/AWB1',
  shipped_at: '2026-10-10T10:00:00Z', expected_delivery_date: '2026-10-15', delivered_at: null, status: 'created', last_event_at: '2026-10-10T10:00:00Z',
  created_at: '2026-10-10T10:00:00Z', shipment_items: [{ order_item_id: 'i1', quantity: 2 }], shipment_events: [
    { id: 'e1', event_type: 'created', occurred_at: '2026-10-10T10:00:00Z', location: null, description: 'Shipment created', created_at: '2026-10-10T10:00:00Z' },
  ], ...o,
});
const order = (o = {}) => ({
  id: 'o1', orderStatus: 'shipped', deliveredAt: null, shipments: [mapShipmentRow(row())],
  products: [{ id: 'i1', title: 'Shirt', variantName: 'Pink', quantity: 2 }, { id: 'i2', title: 'Mug', quantity: 1 }], ...o,
});

describe('status metadata', () => {
  it('has a label, tone and step for every status the database allows', () => {
    for (const s of SHIPMENT_STATUSES) {
      const m = shipmentStatusMeta(s);
      expect(m.label && m.tone).toBeTruthy();
      expect(m.status).toBe(s);
    }
    expect(shipmentStatusMeta('delivered').tone).toBe('success');
    expect(shipmentStatusMeta('delivery_failed').tone).toBe('warning');
    expect(shipmentStatusMeta('returned_to_sender').tone).toBe('danger');
  });
  it('does not throw on an unknown status (a newer server)', () => {
    expect([shipmentStatusMeta('weird_state').label, shipmentStatusMeta('weird_state').tone]).toEqual(['Weird state', 'neutral']);
    expect(shipmentStatusMeta(undefined).label).toBe('Unknown');
  });
  it('labels every event type', () => {
    for (const t of SHIPMENT_EVENT_TYPES) expect(eventLabel(t)).toBeTruthy();
    expect(eventLabel('created')).toBe('Shipped');
    expect(eventLabel('brand_new')).toBe('Brand new');
  });
});

describe('mapShipmentRow', () => {
  it('maps a row with embeds to camelCase and sorts events newest first', () => {
    const s = mapShipmentRow(row({ shipment_events: [
      { id: 'a', event_type: 'created', occurred_at: '2026-10-10T10:00:00Z' },
      { id: 'c', event_type: 'delivered', occurred_at: '2026-10-12T10:00:00Z', location: 'Home' },
      { id: 'b', event_type: 'in_transit', occurred_at: '2026-10-11T10:00:00Z' },
    ] }));
    expect(s.events.map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(s.events[0].location).toBe('Home');
    expect(s.trackingNumber).toBe('AWB1');
    expect(s.items).toEqual([{ orderItemId: 'i1', quantity: 2 }]);
    expect([s.charges, s.note]).toEqual([null, '']);
  });
  it('reads the admin-only embed as object or one-element array, and tolerates its absence', () => {
    expect(mapShipmentRow(row({ shipment_private: { charges: '55.50', note: 'fragile' } })).charges).toBe(55.5);
    expect(mapShipmentRow(row({ shipment_private: [{ charges: 10, note: 'x' }] })).note).toBe('x');
    expect(mapShipmentRow(row({ shipment_private: [] })).charges).toBeNull();
  });
  it('a return shipment carries its request and the pickup reference', () => {
    const s = mapShipmentRow(row({ direction: 'return', request_id: 'req-1', pickup_reference: 'PK-9' }));
    expect([s.direction, s.requestId, s.pickupReference]).toEqual(['return', 'req-1', 'PK-9']);
    const o = mapShipmentRow(row());
    expect([o.requestId, o.pickupReference]).toEqual([null, '']);
  });
  it('null in, null out; list helper drops nulls', () => {
    expect(mapShipmentRow(null)).toBeNull();
    expect(mapShipmentRows([null, row()]).map((s) => s.id)).toEqual(['s1']);
    expect(mapShipmentRows(undefined)).toEqual([]);
  });
  it('customers do not see staff "details updated" notes', () => {
    const s = mapShipmentRow(row({ shipment_events: [
      { id: 'a', event_type: 'created', occurred_at: '2026-10-10T10:00:00Z' }, { id: 'n', event_type: 'note', occurred_at: '2026-10-10T11:00:00Z', description: 'Shipment details updated' },
    ] }));
    expect(customerEvents(s).map((e) => e.id)).toEqual(['a']);
  });
  it('the embed strings never ask the events table for columns customers cannot read', () => {
    for (const sel of [SHIPMENTS_SELECT_CUSTOMER, SHIPMENTS_SELECT_ADMIN]) {
      expect(/shipment_events\(\*/.test(sel)).toBe(false);
      expect(/payload|provider|created_by/.test(sel)).toBe(false);
    }
    expect(SHIPMENTS_SELECT_ADMIN.includes('shipment_private') && !SHIPMENTS_SELECT_CUSTOMER.includes('shipment_private')).toBe(true);
  });
});

describe('summarizeTracking', () => {
  it('an order without shipment rows: legacy shipped is flagged, nothing is invented', () => {
    const t = summarizeTracking({ orderStatus: 'shipped', shipments: [] });
    expect([t.hasShipments, t.legacyShipped, t.trackingNumber, t.status]).toEqual([false, true, '', null]);
    expect(summarizeTracking({ orderStatus: 'confirmed' }).legacyShipped).toBe(false);
    expect(summarizeTracking(null).hasShipments).toBe(false);
  });
  it('one parcel: courier, number, link, status, expected date', () => {
    const t = summarizeTracking(order());
    expect([t.hasShipments, t.total, t.courierName, t.trackingNumber, t.trackingUrl, t.status, t.expectedDeliveryDate])
      .toEqual([true, 1, 'DTDC', 'AWB1', 'https://t.test/AWB1', 'created', '2026-10-15']);
    expect(t.meta.label).toBe('Shipped');
    expect(t.lastEvent.type).toBe('created');
  });
  it('cancelled and non-outbound shipments are ignored', () => {
    const o = order({ shipments: [mapShipmentRow(row({ id: 'x', status: 'cancelled' })), mapShipmentRow(row({ id: 'y', direction: 'return' }))] });
    expect(activeShipments(o)).toHaveLength(0);
    expect(summarizeTracking(o).hasShipments).toBe(false);
  });
  it('two parcels: the least advanced open one is the focus; delivered ones are counted', () => {
    const a = mapShipmentRow(row({ id: 'a', status: 'delivered', delivered_at: '2026-10-12T00:00:00Z', created_at: '2026-10-10T10:00:00Z', tracking_number: 'A' }));
    const b = mapShipmentRow(row({ id: 'b', status: 'in_transit', created_at: '2026-10-10T11:00:00Z', tracking_number: 'B' }));
    const c = mapShipmentRow(row({ id: 'c', status: 'out_for_delivery', created_at: '2026-10-10T12:00:00Z', tracking_number: 'C' }));
    const t = summarizeTracking(order({ shipments: [a, c, b] }));
    expect([t.total, t.deliveredCount, t.multiple, t.trackingNumber, t.status]).toEqual([3, 1, true, 'B', 'in_transit']);
    expect(trackingHeadline(order({ shipments: [a, c, b] }))).toBe('3 parcels · 1 delivered');
  });
  it('all parcels delivered: delivered, the order delivery time is used', () => {
    const a = mapShipmentRow(row({ id: 'a', status: 'delivered', delivered_at: '2026-10-12T00:00:00Z' }));
    const t = summarizeTracking(order({ orderStatus: 'delivered', deliveredAt: '2026-10-12T00:00:00Z', shipments: [a] }));
    expect([t.status, t.expectedDeliveryDate, t.deliveredAt]).toEqual(['delivered', null, '2026-10-12T00:00:00Z']);
  });
  it('a failed attempt needs attention', () => {
    expect(summarizeTracking(order({ shipments: [mapShipmentRow(row({ status: 'delivery_failed' }))] })).needsAttention).toBe(true);
    expect(summarizeTracking(order()).needsAttention).toBe(false);
  });
});

describe('trackingHeadline and trackingSteps', () => {
  it('headline without shipment rows follows the order status', () => {
    expect(trackingHeadline({ orderStatus: 'placed' })).toBe('Processing');
    expect(trackingHeadline({ orderStatus: 'confirmed' })).toBe('Confirmed');
    expect(trackingHeadline({ orderStatus: 'shipped' })).toBe('Shipped');
    expect(trackingHeadline({ orderStatus: 'delivered' })).toBe('Delivered');
    expect(trackingHeadline({ orderStatus: 'cancelled' })).toBe('Cancelled');
  });
  it('headline with a parcel is the courier status', () => {
    expect(trackingHeadline(order({ shipments: [mapShipmentRow(row({ status: 'out_for_delivery' }))] }))).toBe('Out for delivery');
  });
  const done = (steps) => steps.filter((s) => s.done).map((s) => s.key);
  it('stepper: placed / confirmed / shipped / out for delivery / delivered', () => {
    expect(done(trackingSteps({ orderStatus: 'placed' }))).toEqual(['placed']);
    expect(done(trackingSteps({ orderStatus: 'confirmed' }))).toEqual(['placed', 'confirmed']);
    expect(done(trackingSteps({ orderStatus: 'shipped' }))).toEqual(['placed', 'confirmed', 'shipped']);
    expect(done(trackingSteps(order({ shipments: [mapShipmentRow(row({ status: 'out_for_delivery' }))] })))).toEqual(['placed', 'confirmed', 'shipped', 'out_for_delivery']);
    expect(done(trackingSteps({ orderStatus: 'delivered' }))).toEqual(['placed', 'confirmed', 'shipped', 'out_for_delivery', 'delivered']);
    expect(trackingSteps({ orderStatus: 'shipped' }).find((s) => s.current).key).toBe('shipped');
  });
  it('stepper flags a failed delivery attempt on its step', () => {
    const steps = trackingSteps(order({ shipments: [mapShipmentRow(row({ status: 'delivery_failed' }))] }));
    expect(steps.filter((s) => s.warn).map((s) => s.key)).toEqual(['out_for_delivery']);
  });
});

describe('tracking link (twin of the SQL helper)', () => {
  it('encodes like app_urlencode: only A-Z a-z 0-9 _ . ~ - are kept', () => {
    expect(urlEncode('AB 12/3')).toBe('AB%2012%2F3');
    expect(urlEncode('x&y=z')).toBe('x%26y%3Dz');
    expect(urlEncode("a!'()*b")).toBe('a%21%27%28%29%2Ab');
    expect(urlEncode('Rs.5~x_y-z')).toBe('Rs.5~x_y-z');
    expect(urlEncode('')).toBe('');
  });
  it('fills {tracking}; no template / no number / no placeholder -> null', () => {
    expect(trackingUrlFromTemplate('https://t.test/dtdc?awb={tracking}', ' AB 12/3 ')).toBe('https://t.test/dtdc?awb=AB%2012%2F3');
    expect(trackingUrlFromTemplate('https://t.test/{tracking}/x/{tracking}', 'Q1')).toBe('https://t.test/Q1/x/Q1');
    expect(trackingUrlFromTemplate(null, 'Q1')).toBeNull();
    expect(trackingUrlFromTemplate('https://t.test/x', 'Q1')).toBeNull();
    expect(trackingUrlFromTemplate('https://t.test/{tracking}', '  ')).toBeNull();
  });
  it('isHttpUrl accepts http(s) without spaces only', () => {
    expect(['https://a.test/x?y=1', 'http://a', 'HTTPS://A.TEST'].map(isHttpUrl)).toEqual([true, true, true]);
    expect(['ftp://a', 'javascript:alert(1)', 'https://a b', '', 'a.test'].map(isHttpUrl)).toEqual([false, false, false, false, false]);
  });
});

describe('remainingByLine', () => {
  it('counts units already on an active outbound shipment', () => {
    const r = remainingByLine(order());
    expect(r.map((x) => [x.orderItemId, x.quantity, x.shipped, x.remaining])).toEqual([['i1', 2, 2, 0], ['i2', 1, 0, 1]]);
    expect(r[0].variantName).toBe('Pink');
  });
  it('a cancelled shipment releases its units; lines without an id are skipped', () => {
    const o = order({ shipments: [mapShipmentRow(row({ status: 'cancelled' }))], products: [{ id: 'i1', title: 'Shirt', quantity: 2 }, { title: 'legacy line', quantity: 1 }] });
    expect(remainingByLine(o).map((x) => x.remaining)).toEqual([2]);
  });
});

describe('validateShipForm', () => {
  const couriers = [{ code: 'dtdc', name: 'DTDC' }, { code: 'manual', name: 'Other' }, { code: 'pickup', name: 'Pickup' }];
  const ctx = { orderId: 'o1', couriers, now: '2026-10-17T10:00:00Z', remaining: { i1: 2, i2: 1 } };
  const ok = (form) => validateShipForm({ courierCode: 'dtdc', trackingNumber: 'AWB1', ...form }, ctx);

  it('a minimal valid form builds the RPC arguments', () => {
    const r = ok({});
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({
      p_order_id: 'o1', p_courier_code: 'dtdc', p_tracking_number: 'AWB1', p_tracking_url: null, p_shipped_at: null, p_charges: null, p_note: null,
      p_items: null, p_courier_name: null, p_expected_delivery_date: null,
    });
    expect(r.warnings).toEqual({});
  });
  it('trims, rounds charges, converts the date to ISO, passes the expected date', () => {
    const r = ok({ trackingNumber: '  AWB 9  ', charges: '55.555', shippedAt: '2026-10-16T09:30:00Z', expectedDeliveryDate: '2026-10-20', note: ' fragile ', courierName: ' Rider ' });
    expect(r.ok).toBe(true);
    expect([r.payload.p_tracking_number, r.payload.p_charges, r.payload.p_shipped_at, r.payload.p_expected_delivery_date, r.payload.p_note, r.payload.p_courier_name])
      .toEqual(['AWB 9', 55.56, '2026-10-16T09:30:00.000Z', '2026-10-20', 'fragile', 'Rider']);
  });
  it('requires a known courier', () => {
    expect(validateShipForm({ courierCode: '' }, ctx).errors.courierCode).toBeTruthy();
    expect(validateShipForm({ courierCode: 'nope' }, ctx).errors.courierCode).toBe('Unknown courier');
  });
  it('a missing tracking number is a warning, not an error; pickup never warns', () => {
    const r = validateShipForm({ courierCode: 'manual' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.warnings.trackingNumber).toBeTruthy();
    expect(validateShipForm({ courierCode: 'pickup' }, ctx).warnings).toEqual({});
  });
  it('rejects bad links, charges, dates, notes and long numbers', () => {
    expect(ok({ trackingUrl: 'ftp://x' }).errors.trackingUrl).toBeTruthy();
    expect(ok({ trackingUrl: 'https://a b' }).errors.trackingUrl).toBeTruthy();
    expect(ok({ charges: '-1' }).errors.charges).toBeTruthy();
    expect(ok({ charges: 'abc' }).errors.charges).toBeTruthy();
    expect(ok({ charges: '0' }).payload.p_charges).toBe(0);
    expect(ok({ shippedAt: '2026-10-19T10:00:00Z' }).errors.shippedAt).toBeTruthy();
    expect(ok({ shippedAt: 'not a date' }).errors.shippedAt).toBeTruthy();
    expect(ok({ expectedDeliveryDate: '2026-10-01' }).errors.expectedDeliveryDate).toBeTruthy();
    expect(ok({ expectedDeliveryDate: '20/10/2026' }).errors.expectedDeliveryDate).toBeTruthy();
    expect(ok({ note: 'x'.repeat(501) }).errors.note).toBeTruthy();
    expect(ok({ trackingNumber: 'x'.repeat(81) }).errors.trackingNumber).toBeTruthy();
  });
  it('partial shipment: quantities are checked against what is left; an empty selection is refused', () => {
    const good = ok({ items: [{ orderItemId: 'i1', quantity: 1 }, { orderItemId: 'i2', quantity: 0 }] });
    expect(good.ok).toBe(true);
    expect(good.payload.p_items).toEqual([{ order_item_id: 'i1', quantity: 1 }]);
    expect(ok({ items: [{ orderItemId: 'i1', quantity: 3 }] }).errors.items).toBeTruthy();
    expect(ok({ items: [{ orderItemId: 'i1', quantity: 1.5 }] }).errors.items).toBeTruthy();
    expect(ok({ items: [] }).errors.items).toBeTruthy();
    expect(ok({ items: [{ orderItemId: 'i1', quantity: 0 }] }).errors.items).toBeTruthy();
    expect(ok({ items: [{ orderItemId: 'i1', quantity: 1 }, { orderItemId: 'i1', quantity: 1 }] }).errors.items).toBeTruthy();
  });
});

describe('small helpers', () => {
  it('admin event choices are the tracking events the database accepts (minus created / cancelled)', () => {
    const types = ADMIN_EVENT_CHOICES.map((c) => c.type);
    for (const t of types) expect(SHIPMENT_EVENT_TYPES).toContain(t);
    expect(types).not.toContain('created');
    expect(types).not.toContain('cancelled');
    expect(types).toEqual(expect.arrayContaining(['delivered', 'note']));
  });
  it('formatDay formats a day or a timestamp and survives garbage', () => {
    expect(formatDay('2026-10-25')).toMatch(/25/);
    expect(formatDay('2026-10-25T08:00:00Z')).toMatch(/2[45]/);
    expect(formatDay('')).toBe('');
    expect(formatDay('nonsense')).toBe('');
    expect(formatDay(null)).toBe('');
  });
});