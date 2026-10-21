// Port (1:1) of Ecommerce-Website-v2-main/src/features/returns/__tests__/refundModel.test.mjs.
// src/utils/refundModel.js is a byte-identical COPY of the web module; this file keeps the two in sync - change one, change both.
const {
  REFUND_STATUSES, REFUND_METHODS, refundStatusMeta, refundMethodLabel, formatMoney, customerRefundLine, refundsToShow, REFUNDS_COLUMNS_CUSTOMER, REFUNDS_COLUMNS_ORDER, REFUNDS_SELECT_ADMIN,
  mapRefundRow, mapRefundRows, mapCalculation, refundBreakdownRows, refundAdminActions, gatewayStateLabel, validateRefundForm,
} = require('@/utils/refundModel');

const row = (o = {}) => ({
  id: 'f1', refund_no: 'RFD-2026-000001', order_id: 'o1', request_id: 'r1', kind: 'return', amount: '1200.00', currency: 'INR', items_amount: '1227.78', shipping_amount: '0.00',
  adjustment_amount: '-27.78', adjustment_note: 'Return courier cost deducted', method: 'manual', status: 'pending', reference: null, failure_reason: null,
  initiated_at: '2026-10-17T10:00:00Z', completed_at: null, created_at: '2026-10-17T10:00:00Z', ...o,
});

describe('states and wording', () => {
  it('every database status has a customer label, a tone and a final flag', () => {
    for (const s of REFUND_STATUSES) {
      const m = refundStatusMeta(s);
      expect(m.label && m.tone).toBeTruthy();
    }
    expect(REFUND_STATUSES.map((s) => refundStatusMeta(s).label)).toEqual(['Refund processing', 'Refund completed', 'Refund failed - contact support']);
    expect(REFUND_STATUSES.map((s) => refundStatusMeta(s).final)).toEqual([false, true, true]);
    expect(REFUND_METHODS).toEqual(['razorpay', 'manual']);
  });
  it('an unknown status degrades gracefully', () => {
    expect([refundStatusMeta('weird').label, refundStatusMeta('weird').tone, refundStatusMeta('weird').final]).toEqual(['Weird', 'neutral', false]);
    expect(refundStatusMeta(undefined).label).toBe('Unknown');
  });
  it('method wording', () => {
    expect(refundMethodLabel('razorpay')).toBe('Original payment method (Razorpay)');
    expect(refundMethodLabel('manual')).toBe('Bank / UPI transfer');
    expect(refundMethodLabel('store_credit')).toBe('Store credit');
  });
  it('money: Indian grouping, two decimals, rupee sign, other currencies by code, garbage as zero', () => {
    expect(formatMoney(1227.78)).toBe('₹1,227.78');
    expect(formatMoney('100000')).toBe('₹1,00,000.00');
    expect(formatMoney(49)).toBe('₹49.00');
    expect(formatMoney(12.5, 'USD')).toBe('USD 12.50');
    expect(formatMoney(undefined)).toBe('₹0.00');
    expect(formatMoney('abc')).toBe('₹0.00');
  });
});

describe('what the customer reads (spec 9.3)', () => {
  it('Refund Processing', () => {
    const l = customerRefundLine(mapRefundRow(row({ method: 'razorpay' })));
    expect([l.headline, l.tone, l.final]).toEqual(['Refund processing', 'accent', false]);
    expect(l.detail).toBe('₹1,200.00 is being refunded to your original payment method. We will tell you as soon as it is done.');
    expect(customerRefundLine(mapRefundRow(row())).detail).toMatch(/by bank \/ UPI transfer/);
  });
  it('Refund Completed (with the date in IST and the reference)', () => {
    const l = customerRefundLine(mapRefundRow(row({ status: 'succeeded', completed_at: '2026-10-18T20:00:00Z', reference: 'UTR-889977' })));
    expect([l.headline, l.tone, l.final]).toEqual(['Refund completed', 'success', true]);
    expect(l.detail).toBe('₹1,200.00 was refunded on 19 Oct 2026 by bank / UPI transfer. Reference: UTR-889977.'); // 20:00 UTC = 01:30 IST the next day
    expect(customerRefundLine(mapRefundRow(row({ status: 'succeeded', method: 'razorpay', completed_at: null }))).detail).toBe('₹1,200.00 was refunded to your original payment method.');
  });
  it('Refund Failed - contact support (the stored reason, never an optimistic status)', () => {
    const l = customerRefundLine(mapRefundRow(row({ status: 'failed', failure_reason: 'The bank rejected the transfer' })));
    expect([l.headline, l.tone, l.final]).toEqual(['Refund failed - contact support', 'danger', true]);
    expect(l.detail).toBe('The bank rejected the transfer Please contact us and we will sort it out.');
    expect(customerRefundLine(mapRefundRow(row({ status: 'failed' }))).detail).toMatch(/could not complete the refund of ₹1,200\.00/);
  });
  it('the refund of an exchange price difference says what it is for (same three states)', () => {
    const d = (o) => customerRefundLine(mapRefundRow(row({ kind: 'exchange_difference', amount: '100.00', method: 'razorpay', adjustment_amount: '0', adjustment_note: null, items_amount: '100.00', ...o })));
    expect(d({}).detail).toBe('₹100.00 (the price difference of your exchange) is being refunded to your original payment method. We will tell you as soon as it is done.');
    expect(d({ status: 'succeeded', completed_at: '2026-10-18T06:00:00Z' }).detail).toBe('₹100.00 (the price difference of your exchange) was refunded on 18 Oct 2026 to your original payment method.');
    expect(d({ status: 'failed' }).detail).toMatch(/could not complete the refund of ₹100\.00 \(the price difference of your exchange\)\./);
    expect(d({ status: 'failed' }).headline).toBe('Refund failed - contact support');
  });
  it('an order-level refund (a cancelled order, an exchange cancelled after the item came back) says what it is for; without a reason it is just the amount', () => {
    const o = (x) => customerRefundLine(mapRefundRow(row({ kind: 'order', request_id: null, amount: '1100.00', method: 'razorpay', adjustment_amount: '0', adjustment_note: null, items_amount: '1100.00', reason: 'your cancelled order', ...x })));
    expect(o({}).detail).toBe('₹1,100.00 (your cancelled order) is being refunded to your original payment method. We will tell you as soon as it is done.');
    expect(o({ status: 'succeeded', completed_at: '2026-10-18T06:00:00Z', method: 'manual', reason: 'the item you returned' }).detail).toBe('₹1,100.00 (the item you returned) was refunded on 18 Oct 2026 by bank / UPI transfer.');
    expect(o({ status: 'failed' }).detail).toMatch(/could not complete the refund of ₹1,100\.00 \(your cancelled order\)\./);
    expect(o({ reason: null }).detail).toBe('₹1,100.00 is being refunded to your original payment method. We will tell you as soon as it is done.');
    expect(mapRefundRow(row({ reason: 'goodwill' })).reason).toBe('goodwill');
    expect(mapRefundRow(row()).reason).toBe('');
  });
  it('the order-refund columns add the reason and nothing admin-only; the generic list stays free of it (a server without the cancellation migration has no such column)', () => {
    expect(REFUNDS_COLUMNS_ORDER.startsWith(REFUNDS_COLUMNS_CUSTOMER) && REFUNDS_COLUMNS_ORDER.endsWith(', reason')).toBe(true);
    expect(/(^|, )reason($|,)/.test(REFUNDS_COLUMNS_CUSTOMER)).toBe(false);
    expect(/gateway|private|idempotency/.test(REFUNDS_COLUMNS_ORDER)).toBe(false);
  });
  it('nothing for no refund', () => {
    expect(customerRefundLine(null)).toEqual({ headline: '', detail: '', tone: 'neutral', final: false });
  });
  it('refundsToShow: the live refund wins; only failures -> the latest failure', () => {
    const a = mapRefundRow(row({ id: 'a', status: 'failed', created_at: '2026-10-17T09:00:00Z' }));
    const b = mapRefundRow(row({ id: 'b', status: 'failed', created_at: '2026-10-17T11:00:00Z' }));
    const c = mapRefundRow(row({ id: 'c', status: 'pending', created_at: '2026-10-17T12:00:00Z' }));
    expect(refundsToShow([a, b, c]).map((r) => r.id)).toEqual(['c']);
    expect(refundsToShow([a, b]).map((r) => r.id)).toEqual(['b']);
    expect(refundsToShow([])).toEqual([]);
    expect(refundsToShow(null)).toEqual([]);
    expect(refundsToShow([null, a]).map((r) => r.id)).toEqual(['a']);
  });
});

describe('mapping rows', () => {
  it('maps a customer row (numbers as numbers, absent embeds tolerated)', () => {
    const r = mapRefundRow(row());
    expect([r.refundNo, r.requestId, r.kind, r.amount, r.itemsAmount, r.shippingAmount, r.adjustmentAmount, r.adjustmentNote, r.method, r.status])
      .toEqual(['RFD-2026-000001', 'r1', 'return', 1200, 1227.78, 0, -27.78, 'Return courier cost deducted', 'manual', 'pending']);
    expect([r.lines, r.events, r.internalNote, r.attempts, r.gatewayError, r.gatewayState]).toEqual([[], [], '', 0, '', '']);
    expect(mapRefundRow(null)).toBeNull();
    expect(mapRefundRows([null, row()]).map((x) => x.id)).toEqual(['f1']);
  });
  it('reads the admin-only embeds (object or one-element array) and sorts the history newest first', () => {
    const r = mapRefundRow(row({
      method: 'razorpay', gateway_state: 'unknown', gateway_refund_id: 'rfnd_1', gateway_status: 'pending',
      refund_items: [{ id: 'i1', order_item_id: 'oi1', request_item_id: 'ri1', quantity: 2, amount: '944.45' }],
      refund_private: [{ internal_note: 'VIP', initiated_by: 'adm', attempts: 2, gateway_error: 'timeout' }],
      refund_events: [{ id: 'a', event_type: 'created', actor_role: 'admin', created_at: '2026-10-17T10:00:00Z' }, { id: 'b', event_type: 'gateway_unknown', actor_role: 'system', created_at: '2026-10-17T11:00:00Z', note: 'timeout' }],
    }));
    expect([r.gatewayState, r.gatewayRefundId, r.gatewayStatus, r.internalNote, r.attempts, r.gatewayError]).toEqual(['unknown', 'rfnd_1', 'pending', 'VIP', 2, 'timeout']);
    expect(r.lines).toEqual([{ id: 'i1', orderItemId: 'oi1', requestItemId: 'ri1', quantity: 2, amount: 944.45 }]);
    expect(r.events.map((e) => e.id)).toEqual(['b', 'a']);
    expect(mapRefundRow(row({ refund_private: { internal_note: 'x' } })).internalNote).toBe('x');
  });
  it('the customer columns never name an admin-only field; the admin select does', () => {
    for (const c of ['gateway', 'idempotency', 'internal', 'refund_private', 'payload']) expect(REFUNDS_COLUMNS_CUSTOMER.includes(c)).toBe(false);
    expect(REFUNDS_COLUMNS_CUSTOMER.includes('failure_reason') && REFUNDS_COLUMNS_CUSTOMER.includes('completed_at')).toBe(true);
    expect(REFUNDS_SELECT_ADMIN.includes('refund_private') && REFUNDS_SELECT_ADMIN.includes('refund_events') && REFUNDS_SELECT_ADMIN.includes('refund_items')).toBe(true);
  });
});

describe('the calculation table', () => {
  const calc = mapCalculation({
    request_id: 'r2', order_id: 'o1', currency: 'INR', paid_total: 1749, refunded_so_far: 1200, refundable_remaining: 549, paid_for_goods: 1700, shipping_charge: 49,
    seller_fault: true, shipping_eligible: true, shipping_reason: 'Every item of the order is returned for a seller-fault reason',
    lines: [{ order_item_id: 'oi1', request_item_id: 'ri1', title: 'Classic Cotton Shirt', variant_name: null, quantity: 1, ordered: 3, already_refunded_units: 2, paid_share: 1416.67, amount: 472.22 }],
    items_amount: 472.22, shipping_amount: 49, adjustment_amount: 0, amount: 521.22, razorpay_possible: true, payment_method: 'Razorpay',
  });
  it('maps the server answer', () => {
    expect([calc.paidTotal, calc.refundedSoFar, calc.refundableRemaining, calc.paidForGoods, calc.shippingEligible, calc.sellerFault, calc.amount, calc.razorpayPossible])
      .toEqual([1749, 1200, 549, 1700, true, true, 521.22, true]);
    expect([calc.lines[0].title, calc.lines[0].paidShare, calc.lines[0].amount, calc.lines[0].alreadyRefundedUnits]).toEqual(['Classic Cotton Shirt', 1416.67, 472.22, 2]);
    expect(mapCalculation(null)).toBeNull();
  });
  it('the rows: lines, shipping, (adjustment), total - each with the sentence that explains it', () => {
    const rows = refundBreakdownRows(calc);
    expect(rows.map((r) => r.key)).toEqual(['oi1', 'shipping', 'total']);
    expect(rows.map((r) => r.amount)).toEqual([472.22, 49, 521.22]);
    expect(rows[0].label).toBe('Classic Cotton Shirt x1');
    expect(rows[0].note).toMatch(/₹1,416\.67 was paid for the 3 unit\(s\) of this line; 2 already refunded/);
    expect(rows[2].note).toMatch(/₹549\.00 of ₹1,749\.00 can still be refunded/);
    const adj = refundBreakdownRows({ ...calc, adjustmentAmount: -27.78 });
    expect(adj.map((r) => r.key)).toEqual(['oi1', 'shipping', 'adjustment', 'total']);
    expect(adj[2].label).toBe('Adjustment (deducted)');
    expect(refundBreakdownRows({ ...calc, adjustmentAmount: 10 })[2].label).toBe('Adjustment (added)');
    expect(refundBreakdownRows(null)).toEqual([]);
  });
});

describe('the admin side', () => {
  const r = (o) => mapRefundRow(row(o));
  it('buttons follow the state: manual, not sent, in flight, finished', () => {
    expect(refundAdminActions(r({ method: 'manual' }))).toEqual(['mark_paid', 'mark_failed', 'void']);
    expect(refundAdminActions(r({ method: 'razorpay', gateway_state: 'not_sent' }))).toEqual(['send', 'void']);
    for (const s of ['submitting', 'submitted', 'unknown']) expect(refundAdminActions(r({ method: 'razorpay', gateway_state: s }))).toEqual(['check_status']);
    expect(refundAdminActions(r({ status: 'succeeded' }))).toEqual([]);
    expect(refundAdminActions(r({ status: 'failed' }))).toEqual([]);
    expect(refundAdminActions(null)).toEqual([]);
  });
  it('gateway state wording', () => {
    expect(gatewayStateLabel('unknown')).toBe('Razorpay did not confirm - check the status');
    expect(gatewayStateLabel('submitted')).toBe('Accepted by Razorpay - waiting for it to complete');
    expect(gatewayStateLabel('')).toBe('');
  });
  it('the form: method, adjustment (+ needs a reason), shipping choice', () => {
    const good = validateRefundForm({ method: 'manual', adjustment: '-27.78', adjustmentNote: ' Return courier cost deducted ', note: ' ok ' });
    expect(good.ok).toBe(true);
    expect(good.args).toEqual({ method: 'manual', includeShipping: null, adjustment: -27.78, adjustmentNote: 'Return courier cost deducted', note: 'ok' });
    expect(validateRefundForm({ method: 'razorpay', includeShipping: false }).args).toEqual({ method: 'razorpay', includeShipping: false, adjustment: 0, adjustmentNote: '', note: '' });
    expect(validateRefundForm({ method: 'razorpay', includeShipping: true }).args.includeShipping).toBe(true);
    expect(validateRefundForm({ method: 'cheque' }).errors.method).toBe('Choose how the refund is paid');
    expect(validateRefundForm({}).ok).toBe(false);
    expect(validateRefundForm({ method: 'manual', adjustment: 'abc' }).errors.adjustment).toMatch(/as a number/);
    expect(validateRefundForm({ method: 'manual', adjustment: 99999999 }).errors.adjustment).toMatch(/too large/);
    expect(validateRefundForm({ method: 'manual', adjustment: '5' }).errors.adjustmentNote).toMatch(/Explain the adjustment/);
    expect(validateRefundForm({ method: 'manual', adjustment: '0', adjustmentNote: 'ignored' }).args.adjustmentNote).toBe('');
    expect(validateRefundForm({ method: 'manual', adjustment: 5, adjustmentNote: 'x'.repeat(301) }).errors.adjustmentNote).toMatch(/300/);
    expect(validateRefundForm({ method: 'manual', note: 'x'.repeat(1001) }).errors.note).toMatch(/1000/);
    expect(validateRefundForm({ method: 'manual', adjustment: '12.345', adjustmentNote: 'tip' }).args.adjustment).toBe(12.35);
  });
});