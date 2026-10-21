// Port (1:1) of Ecommerce-Website-v2-main/src/features/returns/__tests__/exchangeModel.test.mjs.
// src/utils/exchangeModel.js is a byte-identical COPY of the web module; this file keeps the two in sync - change one, change both.
const {
  FULFILMENT_STATUSES, ADJUSTMENT_KINDS, ADJUSTMENT_STATUSES, money, fulfilmentStatusMeta, replacementLineText, customerAdjustmentLine, adjustmentAdminLine,
  REPLACEMENT_COLUMNS_CUSTOMER, ADJUSTMENT_COLUMNS_CUSTOMER, ADJUSTMENT_SELECT_ADMIN, RESERVATIONS_COLUMNS_ADMIN, mapFulfilmentRow, mapFulfilmentRows, mapAdjustmentRow,
  mapAdjustmentRows, mapReservationRow, mapReservationRows, reservationLabel, buildReplacementMap, customerReplacement, replacementAdminState, replacementAdminActions,
  validateSettleForm, validateExchangeRefundForm, shipReplacementArgs,
} = require('@/utils/exchangeModel');

const fRow = (o = {}) => ({
  id: 'f1', request_id: 'r1', order_id: 'o1', status: 'pending', shipment_id: null, shipped_at: null, delivered_at: null, cancelled_at: null, created_at: '2026-10-17T10:00:00Z',
  replacement_fulfillment_items: [{
    id: 'fi1', request_item_id: 'ri1', order_item_id: 'oi1', product_id: 'p1', variant_id: 'v-white', title: 'Designer Shirt', variant_name: 'White', sku: 'DS-W', image: 'https://img/w.jpg',
    quantity: 2, original_unit_price: '300.00', replacement_unit_price: '200.00', price_difference: '-200.00',
  }],
  ...o,
});
const aRow = (o = {}) => ({ request_id: 'r1', kind: 'refund_due', amount: '100.00', status: 'open', refund_id: null, settled_at: null, created_at: '2026-10-17T10:00:00Z', updated_at: '2026-10-17T10:00:00Z', ...o });
const ship = (o = {}) => ({ id: 's1', requestId: 'r1', direction: 'replacement', status: 'in_transit', courierName: 'Local courier', trackingNumber: 'TRK1', trackingUrl: 'https://t.example/TRK1', createdAt: '2026-10-18T10:00:00Z', ...o });
const exch = (status, o = {}) => ({ id: 'r1', type: 'exchange', status, ...o });

describe('wording and states', () => {
  it('money: Indian grouping, two decimals, garbage as zero', () => {
    expect(money(1227.78)).toBe('₹1,227.78');
    expect(money('100000')).toBe('₹1,00,000.00');
    expect(money(undefined)).toBe('₹0.00');
  });
  it('every database status has a label, a tone and a final flag; unknown ones degrade', () => {
    expect(FULFILMENT_STATUSES.map((s) => fulfilmentStatusMeta(s).label)).toEqual(['Being prepared', 'On its way', 'Delivered', 'Cancelled']);
    expect(FULFILMENT_STATUSES.map((s) => fulfilmentStatusMeta(s).final)).toEqual([false, false, true, true]);
    for (const s of FULFILMENT_STATUSES) expect(fulfilmentStatusMeta(s).tone).toBeTruthy();
    expect([fulfilmentStatusMeta('weird').label, fulfilmentStatusMeta('weird').tone]).toEqual(['Weird', 'neutral']);
    expect(fulfilmentStatusMeta(undefined).label).toBe('Unknown');
    expect(ADJUSTMENT_KINDS).toEqual(['none', 'balance_due', 'refund_due']);
    expect(ADJUSTMENT_STATUSES).toEqual(['open', 'collected', 'refunded', 'waived', 'not_needed']);
  });
  it('a line of the replacement', () => {
    expect(replacementLineText({ title: 'Designer Shirt', variantName: 'White', quantity: 2 })).toBe('Designer Shirt · White x2');
    expect(replacementLineText({ title: 'Mug', variantName: '', quantity: 1 })).toBe('Mug x1');
    expect(replacementLineText(null)).toBe('');
  });
});

describe('the price difference as the customer reads it', () => {
  const adj = (o) => mapAdjustmentRow(aRow(o));
  it('same price: nothing to say', () => {
    expect(customerAdjustmentLine(adj({ kind: 'none', amount: '0.00', status: 'not_needed' }))).toBeNull();
    expect(customerAdjustmentLine(null)).toBeNull();
  });
  it('the customer owes: to pay, paid, waived', () => {
    const open = customerAdjustmentLine(adj({ kind: 'balance_due', amount: '50.00' }));
    expect([open.headline, open.tone, open.open]).toEqual(['Price difference to pay', 'warning', true]);
    expect(open.detail).toBe('The replacement costs ₹50.00 more than the item you return. We will contact you to collect it before we send it.');
    const paid = customerAdjustmentLine(adj({ kind: 'balance_due', amount: '50.00', status: 'collected' }));
    expect([paid.headline, paid.detail, paid.open]).toEqual(['Price difference paid', 'We received the ₹50.00 difference. Thank you.', false]);
    expect(customerAdjustmentLine(adj({ kind: 'balance_due', amount: '50.00', status: 'waived' })).headline).toBe('Price difference waived');
  });
  it('a refund is due: promised, refunded, closed - never "refunded" before the server says so', () => {
    const open = customerAdjustmentLine(adj({}));
    expect([open.headline, open.tone, open.open]).toEqual(['Price difference refund', 'accent', true]);
    expect(open.detail).toBe('The replacement costs ₹100.00 less than the item you return. We will refund the difference.');
    expect(customerAdjustmentLine(adj({ status: 'refunded' })).detail).toBe('₹100.00 was refunded to you.');
    const waived = customerAdjustmentLine(adj({ status: 'waived' }));
    expect([waived.headline, waived.open]).toEqual(['No refund due', false]);
    expect(open.detail).not.toMatch(/was refunded/);
  });
  it('staff wording', () => {
    expect(adjustmentAdminLine(adj({ kind: 'balance_due', amount: '50' }))).toBe('Customer owes ₹50.00 - not settled yet');
    expect(adjustmentAdminLine(adj({}))).toBe('Customer is owed ₹100.00 - not settled yet');
    expect(adjustmentAdminLine(adj({ status: 'refunded' }))).toBe('Customer is owed ₹100.00 - refunded');
    expect(adjustmentAdminLine(adj({ kind: 'none', amount: '0', status: 'not_needed' }))).toBe('Same price: nothing to settle');
    expect(adjustmentAdminLine(null)).toBe('');
  });
});

describe('mapping rows', () => {
  it('the select lists name the right tables', () => {
    expect(REPLACEMENT_COLUMNS_CUSTOMER).toMatch(/replacement_fulfillment_items/);
    expect(ADJUSTMENT_COLUMNS_CUSTOMER).not.toMatch(/reference|internal/);
    expect(ADJUSTMENT_SELECT_ADMIN).toMatch(/exchange_adjustment_private\(reference, internal_note/);
    expect(RESERVATIONS_COLUMNS_ADMIN).toMatch(/stock_moved/);
  });
  it('maps a fulfilment with its lines (numbers as numbers)', () => {
    const f = mapFulfilmentRow(fRow());
    expect([f.id, f.requestId, f.orderId, f.status, f.shipmentId]).toEqual(['f1', 'r1', 'o1', 'pending', null]);
    expect(f.lines[0]).toEqual({
      id: 'fi1', requestItemId: 'ri1', orderItemId: 'oi1', productId: 'p1', variantId: 'v-white', title: 'Designer Shirt', variantName: 'White', sku: 'DS-W', image: 'https://img/w.jpg',
      quantity: 2, originalUnitPrice: 300, replacementUnitPrice: 200, priceDifference: -200,
    });
    expect(mapFulfilmentRow(null)).toBeNull();
    expect(mapFulfilmentRows([null, fRow()]).map((x) => x.id)).toEqual(['f1']);
    expect(mapFulfilmentRow(fRow({ replacement_fulfillment_items: undefined })).lines).toEqual([]);
  });
  it('maps an adjustment; the staff fields only when the admin asked for them', () => {
    const a = mapAdjustmentRow(aRow());
    expect([a.requestId, a.kind, a.amount, a.status, a.refundId, a.reference, a.internalNote]).toEqual(['r1', 'refund_due', 100, 'open', null, '', '']);
    const b = mapAdjustmentRow(aRow({ exchange_adjustment_private: [{ reference: 'UPI 4488', internal_note: 'paid at the counter' }] }));
    expect([b.reference, b.internalNote]).toEqual(['UPI 4488', 'paid at the counter']);
    expect(mapAdjustmentRow(aRow({ exchange_adjustment_private: { reference: 'x' } })).reference).toBe('x');
    expect(mapAdjustmentRow(undefined)).toBeNull();
    expect(mapAdjustmentRows([aRow(), null]).length).toBe(1);
  });
  it('maps a reservation and words its state for staff', () => {
    const r = mapReservationRow({ request_item_id: 'ri1', request_id: 'r1', product_id: 'p1', variant_id: '', quantity: 1, unit_price: '200', stock_moved: true, status: 'reserved' });
    expect([r.requestItemId, r.variantId, r.quantity, r.unitPrice, r.stockMoved, r.status]).toEqual(['ri1', '', 1, 200, true, 'reserved']);
    expect(reservationLabel(r)).toBe('Stock reserved');
    expect(reservationLabel({ ...r, status: 'released' })).toBe('Stock released');
    expect(reservationLabel({ ...r, status: 'fulfilled' })).toBe('Shipped');
    expect(reservationLabel({ ...r, stockMoved: false })).toBe('Stock reserved (stock not tracked)');
    expect(reservationLabel(null)).toBe('No stock held');
    expect(mapReservationRows([null, { request_item_id: 'x', quantity: 1 }]).length).toBe(1);
  });
});

describe('the customer card', () => {
  const bundle = (o = {}) => ({ fulfilment: mapFulfilmentRow(fRow()), adjustment: mapAdjustmentRow(aRow()), shipment: null, ...o });
  it('buildReplacementMap: by request, the newest live parcel, cancelled ones ignored', () => {
    const f1 = mapFulfilmentRow(fRow());
    const f2 = mapFulfilmentRow(fRow({ id: 'f2', request_id: 'r2' }));
    const m = buildReplacementMap([f1, f2, null], [mapAdjustmentRow(aRow())], [
      ship({ id: 'old', status: 'cancelled', createdAt: '2026-10-19T10:00:00Z' }), ship({ id: 'a', createdAt: '2026-10-18T10:00:00Z' }), ship({ id: 'b', createdAt: '2026-10-18T12:00:00Z' }),
      ship({ id: 'other', requestId: 'r3' }), ship({ id: 'orphan', requestId: null }),
    ]);
    expect(Object.keys(m).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(m.r1.fulfilment.id).toBe('f1');
    expect(m.r1.adjustment.kind).toBe('refund_due');
    expect(m.r1.shipment.id).toBe('b');
    expect(m.r2.adjustment).toBeNull();
    expect(m.r2.shipment).toBeNull();
    expect(m.r3.fulfilment).toBeNull();
    expect(m.r3.shipment.id).toBe('other');
    expect(buildReplacementMap(null, null, null)).toEqual({});
  });
  it('being prepared, with the lines and the price difference; no tracking yet', () => {
    const c = customerReplacement(exch('replacement_pending'), bundle());
    expect(c.headline).toBe('Your replacement is being prepared');
    expect(c.status.label).toBe('Being prepared');
    expect(c.lines).toEqual([{ id: 'fi1', text: 'Designer Shirt · White x2' }]);
    expect(c.tracking).toBeNull();
    expect(c.adjustment.headline).toBe('Price difference refund');
  });
  it('on its way: the courier and tracking of the parcel', () => {
    const c = customerReplacement(exch('replacement_shipped'), bundle({ fulfilment: mapFulfilmentRow(fRow({ status: 'shipped' })), shipment: ship() }));
    expect(c.headline).toBe('Your replacement is on its way');
    expect(c.tracking).toEqual({ courier: 'Local courier', number: 'TRK1', url: 'https://t.example/TRK1', status: 'in_transit' });
    expect(customerReplacement(exch('replacement_shipped'), bundle({ fulfilment: mapFulfilmentRow(fRow({ status: 'shipped' })), shipment: ship({ courierName: '', trackingNumber: '' }) })).tracking.courier).toBe('Courier');
  });
  it('delivered', () => {
    expect(customerReplacement(exch('closed'), bundle({ fulfilment: mapFulfilmentRow(fRow({ status: 'delivered' })) })).headline).toBe('Your replacement was delivered');
  });
  it('nothing for a return, a missing / cancelled record, or no bundle', () => {
    expect(customerReplacement({ type: 'return', status: 'refunded' }, bundle())).toBeNull();
    expect(customerReplacement(exch('replacement_pending'), undefined)).toBeNull();
    expect(customerReplacement(exch('replacement_pending'), { fulfilment: null })).toBeNull();
    expect(customerReplacement(exch('cancelled'), bundle({ fulfilment: mapFulfilmentRow(fRow({ status: 'cancelled' })) }))).toBeNull();
    expect(customerReplacement(null, bundle())).toBeNull();
  });
  it('the same price shows no price difference block', () => {
    expect(customerReplacement(exch('replacement_pending'), bundle({ adjustment: mapAdjustmentRow(aRow({ kind: 'none', amount: '0', status: 'not_needed' })) })).adjustment).toBeNull();
  });
});

describe('what the admin may do', () => {
  const st = (status, o = {}, refunds = []) => replacementAdminState(exch(status), { fulfilment: mapFulfilmentRow(fRow(o.f)), adjustment: o.a === null ? null : mapAdjustmentRow(aRow(o.a)) }, refunds);
  it('replacement pending, nothing owed: ship it; a refund due can be paid or waived', () => {
    const s = st('replacement_pending');
    expect([s.canShip, s.shipBlocked, s.canRefund, s.canWaive, s.canCollect, s.canMarkDelivered]).toEqual([true, '', true, true, false, false]);
    expect(replacementAdminActions(s)).toEqual(['ship', 'refund', 'waive']);
  });
  it('the customer owes money: shipping is blocked until collected or waived', () => {
    const s = st('replacement_pending', { a: { kind: 'balance_due', amount: '50.00' } });
    expect([s.canShip, s.canCollect, s.canWaive, s.canRefund]).toEqual([false, true, true, false]);
    expect(s.shipBlocked).toBe('Collect or waive the price difference of ₹50.00 before the replacement ships');
    expect(replacementAdminActions(s)).toEqual(['collect', 'waive']);
    expect(st('replacement_pending', { a: { kind: 'balance_due', amount: '50.00', status: 'collected' } }).canShip).toBe(true);
    expect(st('replacement_pending', { a: { kind: 'balance_due', amount: '50.00', status: 'waived' } }).canShip).toBe(true);
  });
  it('a refund in progress: no second refund, no waiver', () => {
    const s = st('replacement_pending', {}, [{ kind: 'exchange_difference', status: 'pending' }]);
    expect([s.refundActive, s.canRefund, s.canWaive]).toEqual([true, false, false]);
    // a failed one does not count: the admin may try again
    expect([st('replacement_pending', {}, [{ kind: 'exchange_difference', status: 'failed' }]).canRefund, st('replacement_pending', {}, [{ kind: 'return', status: 'pending' }]).canRefund]).toEqual([true, true]);
  });
  it('shipped: mark delivered; delivered with an open difference: waiting to close', () => {
    const shipped = st('replacement_shipped', { f: { status: 'shipped' } });
    expect([shipped.canShip, shipped.canMarkDelivered, shipped.waitingToClose]).toEqual([false, true, false]);
    const delivered = st('replacement_delivered', { f: { status: 'delivered' } });
    expect([delivered.canMarkDelivered, delivered.waitingToClose, delivered.canRefund]).toEqual([false, true, true]);
    expect(st('replacement_delivered', { f: { status: 'delivered' }, a: { status: 'refunded' } }).waitingToClose).toBe(false);
  });
  it('no record / no adjustment / a return: nothing', () => {
    expect(replacementAdminActions(replacementAdminState(exch('replacement_pending'), null))).toEqual([]);
    const none = replacementAdminState(exch('replacement_pending'), { fulfilment: mapFulfilmentRow(fRow()), adjustment: null });
    expect([none.hasRecord, none.canShip]).toEqual([true, true]);
    expect(replacementAdminState({ type: 'return', status: 'replacement_pending' }, { fulfilment: mapFulfilmentRow(fRow()), adjustment: null }).canShip).toBe(false);
    expect(replacementAdminActions(null)).toEqual([]);
  });
});

describe('forms', () => {
  it('settle: collected needs the payment reference, waived needs a reason', () => {
    expect(validateSettleForm({ resolution: 'collected', reference: '  UPI 4488  ', note: 'at the counter' })).toEqual({ ok: true, errors: {}, args: { resolution: 'collected', reference: 'UPI 4488', note: 'at the counter' } });
    expect(validateSettleForm({ resolution: 'collected' }).errors.reference).toBe('Enter the payment reference (how and when the customer paid)');
    expect(validateSettleForm({ resolution: 'waived' }).errors.note).toBe('Say why the difference is waived');
    const w = validateSettleForm({ resolution: 'waived', reference: 'ignored', note: 'goodwill' });
    expect([w.ok, w.args.reference, w.args.note]).toEqual([true, '', 'goodwill']);
    expect(validateSettleForm({ resolution: 'paid' }).errors.resolution).toBe('Choose collected or waived');
    expect(validateSettleForm(null).ok).toBe(false);
    expect(validateSettleForm({ resolution: 'collected', reference: 'x'.repeat(201) }).errors.reference).toBe('At most 200 characters');
    expect(validateSettleForm({ resolution: 'waived', note: 'x'.repeat(1001) }).errors.note).toBe('At most 1000 characters');
  });
  it('refund of the difference: a method, an optional note', () => {
    expect(validateExchangeRefundForm({ method: 'manual', note: ' paid by UPI ' })).toEqual({ ok: true, errors: {}, args: { method: 'manual', note: 'paid by UPI' } });
    expect(validateExchangeRefundForm({ method: 'razorpay' }).ok).toBe(true);
    expect(validateExchangeRefundForm({}).errors.method).toBe('Choose how the refund is paid');
    expect(validateExchangeRefundForm({ method: 'cheque' }).ok).toBe(false);
    expect(validateExchangeRefundForm({ method: 'manual', note: 'x'.repeat(1001) }).errors.note).toBe('At most 1000 characters');
  });
  it('ship_replacement() arguments from the shipping form payload (the order and items are dropped)', () => {
    const payload = { p_order_id: 'o1', p_courier_code: 'delhivery', p_tracking_number: 'T1', p_tracking_url: null, p_shipped_at: '2026-10-18T10:00:00.000Z', p_charges: 40, p_note: 'boxed', p_items: null, p_courier_name: 'Delhivery', p_expected_delivery_date: '2026-10-22' };
    expect(shipReplacementArgs('r1', payload)).toEqual({
      p_request_id: 'r1', p_courier_code: 'delhivery', p_courier_name: 'Delhivery', p_tracking_number: 'T1', p_tracking_url: null, p_shipped_at: '2026-10-18T10:00:00.000Z',
      p_charges: 40, p_note: 'boxed', p_expected_delivery_date: '2026-10-22',
    });
    expect(Object.prototype.hasOwnProperty.call(shipReplacementArgs('r1', payload), 'p_order_id')).toBe(false);
    expect(shipReplacementArgs('r1', payload).p_items).toBeUndefined();
    const empty = shipReplacementArgs('r1', {});
    expect([empty.p_courier_code, empty.p_charges, empty.p_tracking_number]).toEqual(['manual', null, null]);
    expect(shipReplacementArgs('r1', { p_charges: 0 }).p_charges).toBe(0);
  });
});