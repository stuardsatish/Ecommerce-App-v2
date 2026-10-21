// Port (1:1) of Ecommerce-Website-v2-main/src/features/returns/__tests__/requestModel.test.mjs.
// src/utils/requestModel.js is a byte-identical COPY of the web module; this file keeps the two in sync - change one, change both.
const {
  REQUEST_STATUSES, FINAL_STATUSES, requestStatusMeta, requestTypeLabel, adminStatusLabel, itemStatusLabel, ELIGIBILITY_CODES, eligibilityMessage,
  formatDeadline, describeEligibility, anyEligible, reasonOptions, EVIDENCE_MIME, EVIDENCE_MAX_BYTES, EVIDENCE_MAX_FILES, evidenceFileError, evidencePath,
  validateRequestForm, mapRequestRow, mapRequestRows, mapRequestItem, canCustomerCancel, canCustomerRespond, canSubmitReturnTracking, adminActions,
  requestProgress, requestSummaryLine, REQUESTS_SELECT_CUSTOMER, REQUESTS_SELECT_ADMIN, REQUESTS_COLUMNS_CUSTOMER, REQUEST_ITEM_COLUMNS_CUSTOMER, effectivePrice, replacementOptions, defaultReplacement,
} = require('@/utils/requestModel');

const REASONS = [
  { code: 'damaged', label: 'Damaged product', applies_to: ['return', 'exchange'], requires_evidence: true, requires_description: false, active: true, sort_order: 10 },
  { code: 'incorrect_size', label: 'Incorrect size', applies_to: ['return', 'exchange'], requires_evidence: false, requires_description: false, active: true, sort_order: 50 },
  { code: 'missing_item', label: 'Missing item', applies_to: ['return'], requires_evidence: false, requires_description: true, active: true, sort_order: 30 },
  { code: 'old_reason', label: 'Old', applies_to: ['return', 'exchange'], active: false, sort_order: 1 },
];
const ok = (o = {}) => ({ eligible: true, reasons: [], window_days: 7, deadline: '2026-10-17T18:29:59.999Z', remaining_qty: 2, active_request_id: null, ...o });
const no = (reasons, o = {}) => ({ eligible: false, reasons, window_days: 7, deadline: '2026-10-17T18:29:59.999Z', remaining_qty: 0, active_request_id: null, ...o });
const ELIG = {
  order_id: 'o1', order_status: 'delivered',
  items: [
    { order_item_id: 'i1', title: 'Shirt', return: ok(), exchange: ok() },
    { order_item_id: 'i2', title: 'Mug', return: no(['POLICY_DISABLED']), exchange: ok({ remaining_qty: 1 }) },
    { order_item_id: 'i3', title: 'Cap', return: no(['WINDOW_EXPIRED']), exchange: no(['WINDOW_EXPIRED']) },
  ],
};
const CTX = { orderId: 'o1', requestId: 'req-1', eligibility: ELIG, reasons: REASONS };

describe('statuses', () => {
  it('every database status has a customer label and a tone; final ones are flagged', () => {
    for (const s of REQUEST_STATUSES) {
      const m = requestStatusMeta(s);
      expect(m.label && m.tone).toBeTruthy();
      expect(m.final).toBe(FINAL_STATUSES.includes(s));
    }
    expect(requestStatusMeta('pending_review').label).toBe('Pending admin review');
    expect(requestStatusMeta('refund_pending').label).toBe('Refund processing');
    expect(requestStatusMeta('refunded').label).toBe('Refund completed');
    expect(FINAL_STATUSES.slice().sort()).toEqual(['cancelled', 'closed', 'rejected']);
  });
  it('an unknown status (newer server) degrades gracefully', () => {
    expect([requestStatusMeta('weird_state').label, requestStatusMeta('weird_state').tone, requestStatusMeta('weird_state').final]).toEqual(['Weird state', 'neutral', false]);
    expect(requestStatusMeta(undefined).label).toBe('Unknown');
  });
  it('labels', () => {
    expect([requestTypeLabel('exchange'), requestTypeLabel('return'), requestTypeLabel('x')]).toEqual(['Exchange', 'Return', 'Return']);
    expect(adminStatusLabel('awaiting_return_shipment')).toBe('Awaiting return shipment');
    expect(['pending', 'passed', 'failed', 'mystery'].map(itemStatusLabel)).toEqual(['Waiting for review', 'Accepted', 'Not accepted', 'Mystery']);
  });
});

describe('eligibility text', () => {
  it('has a sentence for every server reason code', () => {
    for (const c of ELIGIBILITY_CODES) {
      expect((eligibilityMessage(c) && eligibilityMessage(c) !== 'Not available') || c === 'POLICY_DISABLED').toBeTruthy();
    }
    expect(eligibilityMessage('SOMETHING_NEW')).toBe('Not available');
  });
  it('formats the deadline as an IST day', () => {
    expect(formatDeadline('2026-10-17T18:29:59.999Z')).toBe('17 Oct 2026'); // 23:59:59.999 IST
    expect(formatDeadline('2026-10-17T18:30:00.000Z')).toBe('18 Oct 2026');
    expect(formatDeadline('')).toBe('');
    expect(formatDeadline('nope')).toBe('');
  });
  it('an eligible line says what and until when', () => {
    const d = describeEligibility(ok(), 'return');
    expect([d.eligible, d.label, d.hint, d.remaining]).toEqual([true, 'Return', 'Until 17 Oct 2026', 2]);
    expect(describeEligibility(ok(), 'exchange').label).toBe('Exchange');
  });
  it('an ineligible line gives the most useful single reason', () => {
    expect(describeEligibility(no(['WINDOW_EXPIRED']), 'return').hint).toBe('The return period ended on 17 Oct 2026');
    expect(describeEligibility(no(['WINDOW_EXPIRED']), 'exchange').hint).toBe('The exchange period ended on 17 Oct 2026');
    expect(describeEligibility(no(['POLICY_DISABLED']), 'return').hint).toBe('Not available for this item');
    expect(describeEligibility(no(['NO_REMAINING_QTY', 'ACTIVE_REQUEST']), 'return').hint).toBe('A request for this item is in progress');
    expect(describeEligibility(no(['NOT_DELIVERED', 'POLICY_DISABLED']), 'return').hint).toBe('Available after the order is delivered');
    expect(describeEligibility(no(['NEW_CODE']), 'return').hint).toBe('Not available');
    const d = describeEligibility(no(['POLICY_DISABLED']), 'return');
    expect([d.eligible, d.label]).toEqual([false, 'Return unavailable']);
  });
  it('missing data never throws', () => {
    expect(describeEligibility(null, 'return').eligible).toBe(false);
    expect(describeEligibility({ eligible: false }, 'return').hint).toBe('Not available');
  });
  it('anyEligible tells whether to show the section at all', () => {
    expect(anyEligible(ELIG, 'return')).toBe(true);
    expect(anyEligible({ items: [{ return: no(['POLICY_DISABLED']), exchange: no(['POLICY_DISABLED']) }] }, 'exchange')).toBe(false);
    expect(anyEligible(null, 'return')).toBe(false);
  });
});

describe('exchange replacement options', () => {
  const NOW = Date.parse('2026-10-17T10:00:00Z');
  const shirt = { id: 'p1', title: 'Designer Shirt', price: 500, discount: 10, discount_expiry: '2026-12-01T00:00:00Z', has_variants: true, main_option_enabled: true, stock: 4, track_inventory: true, status: 'active' };
  const variants = [
    { id: 'var_pink', name: 'Pink', price: 300, stock: 0, track_inventory: true, status: 'active' },
    { id: 'var_white', name: 'White', price: 200, stock: 5, track_inventory: true, status: 'active' },
    { id: 'var_old', name: 'Old', price: 100, stock: 9, track_inventory: true, status: 'inactive' },
    { id: 'var_free', name: 'Made to order', price: 250, stock: 0, track_inventory: false, status: 'active' },
  ];
  it('the effective price follows the discount and its expiry (like the database function)', () => {
    expect(effectivePrice(500, 10, '2026-12-01T00:00:00Z', NOW)).toBe(450);
    expect(effectivePrice(500, 10, '2026-01-01T00:00:00Z', NOW)).toBe(500); // expired
    expect(effectivePrice(500, 10, null, NOW)).toBe(450);
    expect(effectivePrice(500, 0, null, NOW)).toBe(500);
    expect(effectivePrice('99.995', 0, null, NOW)).toBe(100);
    expect(effectivePrice(undefined, undefined, undefined, NOW)).toBe(0);
  });
  it('main option + active variants of the SAME product, with stock and the price difference to what was bought', () => {
    const o = replacementOptions(shirt, variants, { variantId: 'var_pink', unitPrice: 300 }, NOW);
    expect(o.map((x) => x.variantId)).toEqual(['', 'var_pink', 'var_white', 'var_free']);
    expect(o.map((x) => x.inStock)).toEqual([true, false, true, true]);
    expect(o.map((x) => x.difference)).toEqual([150, 0, -100, -50]);
    expect(o.map((x) => x.isSame)).toEqual([false, true, false, false]);
    expect(o[0].label).toBe('Main option');
  });
  it('a single product offers itself again (the replacement of a defective unit); a switched-off main option is not offered', () => {
    const mug = { id: 'p2', title: 'Mug', price: 150, discount: 0, has_variants: false, main_option_enabled: true, stock: 3, track_inventory: true, status: 'active' };
    const o = replacementOptions(mug, [], { variantId: '', unitPrice: 150 }, NOW);
    expect([o.length, o[0].label, o[0].isSame, o[0].difference]).toEqual([1, 'Mug', true, 0]);
    const noMain = replacementOptions({ ...shirt, main_option_enabled: false }, variants, { variantId: 'var_white', unitPrice: 200 }, NOW);
    expect(noMain.some((x) => x.variantId === '')).toBe(false);
  });
  it('nothing for a missing or draft product', () => {
    expect(replacementOptions(null, variants, { variantId: '', unitPrice: 1 })).toEqual([]);
    expect(replacementOptions({ ...shirt, status: 'draft' }, variants, { variantId: '', unitPrice: 1 })).toEqual([]);
  });
  it('the default is the same option when it is in stock, else the first one that is', () => {
    const base = replacementOptions(shirt, variants, { variantId: 'var_white', unitPrice: 200 }, NOW);
    expect(defaultReplacement(base)).toBe('var_white');
    const pinkOut = replacementOptions(shirt, variants, { variantId: 'var_pink', unitPrice: 300 }, NOW);
    expect(defaultReplacement(pinkOut)).toBe(''); // the main option comes first and is in stock
    expect(defaultReplacement([{ variantId: 'a', inStock: false, isSame: true }])).toBeNull();
    expect(defaultReplacement([])).toBeNull();
    expect(defaultReplacement(undefined)).toBeNull();
  });
});

describe('reasons and evidence', () => {
  it('reasonOptions: active, for the type, in the admin order', () => {
    expect(reasonOptions(REASONS, 'return').map((r) => r.code)).toEqual(['damaged', 'missing_item', 'incorrect_size']);
    expect(reasonOptions(REASONS, 'exchange').map((r) => r.code)).toEqual(['damaged', 'incorrect_size']);
    expect(reasonOptions(undefined, 'return')).toEqual([]);
  });
  it('accepts only JPEG / PNG / WebP up to 5 MB', () => {
    expect(EVIDENCE_MIME).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(EVIDENCE_MAX_BYTES).toBe(5242880);
    expect(evidenceFileError({ type: 'image/png', size: 1000 })).toBe('');
    expect(evidenceFileError({ type: 'application/pdf', size: 1000 })).toMatch(/JPEG, PNG or WebP/);
    expect(evidenceFileError({ type: 'image/jpeg', size: EVIDENCE_MAX_BYTES + 1 })).toMatch(/5 MB/);
    expect(evidenceFileError({ type: 'image/jpeg', size: 0 })).toMatch(/empty/);
    expect(evidenceFileError({ type: 'image/jpeg', size: EVIDENCE_MAX_BYTES })).toBe('');
    expect(evidenceFileError(null)).toBe('No file');
  });
  it('builds the storage path the policy and the RPC demand', () => {
    expect(evidencePath('uid-1', 'req-1', 0, { name: 'My Photo (1).JPG', type: 'image/jpeg' })).toBe('uid-1/req-1/1-My-Photo-1.jpg');
    expect(evidencePath('uid-1', 'req-1', 2, { name: '../../etc/passwd', type: 'image/png' })).toBe('uid-1/req-1/3-passwd.png'); // only the last path segment is used
    expect(evidencePath('uid-1', 'req-1', 0, { name: 'C:\\Users\\me\\IMG 001.png', type: 'image/png' })).toBe('uid-1/req-1/1-IMG-001.png');
    expect(evidencePath('u', 'r', 0, { name: '', type: 'image/webp' })).toBe('u/r/1-photo.webp');
    expect(evidencePath('u', 'r', 0, { name: 'x'.repeat(300) + '.jpg', type: 'image/jpeg' })).toMatch(/^u\/r\/1-x{60}\.jpg$/);
    // exactly what the RPC accepts: <uid>/<request>/<[A-Za-z0-9._-]{1,120}>
    expect(evidencePath('u', 'r', 0, { name: 'a b&c.jpg', type: 'image/jpeg' })).toMatch(/^u\/r\/[A-Za-z0-9._-]{1,120}$/);
    expect(EVIDENCE_MAX_FILES).toBe(6);
  });
});

describe('validateRequestForm', () => {
  const line = (id, q, o = {}) => ({ orderItemId: id, quantity: q, selected: true, ...o });
  const good = (o = {}) => validateRequestForm({ type: 'return', reasonCode: 'incorrect_size', lines: [line('i1', 1)], ...o }, CTX);

  it('a valid return builds the RPC arguments', () => {
    const r = good({ description: ' too small ', contactPhone: ' +91 98765 43210 ' });
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({
      p_request_id: 'req-1', p_order_id: 'o1', p_type: 'return', p_items: [{ order_item_id: 'i1', quantity: 1 }], p_reason_code: 'incorrect_size',
      p_description: 'too small', p_contact_phone: '+91 98765 43210', p_evidence: [],
    });
  });
  it('only the ticked lines, with their quantities', () => {
    const r = good({ lines: [line('i1', 2), { orderItemId: 'i2', quantity: 1, selected: false }] });
    expect(r.ok).toBe(true);
    expect(r.payload.p_items).toEqual([{ order_item_id: 'i1', quantity: 2 }]);
  });
  it('needs at least one line, and every line must still be eligible and within what is left', () => {
    expect(good({ lines: [] }).errors.items).toMatch(/at least one item/);
    expect(good({ lines: [{ orderItemId: 'i1', quantity: 1, selected: false }] }).errors.items).toMatch(/at least one item/);
    expect(good({ lines: [line('i2', 1)] }).errors.items).toMatch(/cannot be requested any more/); // returns off for the Mug
    expect(good({ lines: [line('i3', 1)] }).errors.items).toMatch(/cannot be requested any more/);
    expect(good({ lines: [line('i9', 1)] }).errors.items).toMatch(/cannot be requested any more/); // not part of the order
    expect(good({ lines: [line('i1', 3)] }).errors.items).toMatch(/Only 2 unit/);
    expect(good({ lines: [line('i1', 0)] }).errors.items).toMatch(/whole numbers/);
    expect(good({ lines: [line('i1', 1.5)] }).errors.items).toMatch(/whole numbers/);
  });
  it('the same line can be exchanged where it cannot be returned', () => {
    const r = validateRequestForm({ type: 'exchange', reasonCode: 'incorrect_size', lines: [line('i2', 1, { replacementVariantId: 'var_x' })] }, CTX);
    expect(r.ok).toBe(true);
    expect(r.payload.p_items).toEqual([{ order_item_id: 'i2', quantity: 1, replacement_variant_id: 'var_x' }]);
    expect(r.payload.p_type).toBe('exchange');
  });
  it('an exchange must say what it wants instead ("" = the main option is a valid choice)', () => {
    expect(validateRequestForm({ type: 'exchange', reasonCode: 'incorrect_size', lines: [line('i1', 1)] }, CTX).errors.replacement).toMatch(/instead/);
    expect(validateRequestForm({ type: 'exchange', reasonCode: 'incorrect_size', lines: [line('i1', 1, { replacementVariantId: '' })] }, CTX).ok).toBe(true);
  });
  it('the reason is required and must come from the list', () => {
    expect(good({ reasonCode: '' }).errors.reasonCode).toBe('Choose a reason');
    expect(good({ reasonCode: 'made_up' }).errors.reasonCode).toBe('Choose a reason from the list');
  });
  it('a reason can require a description or a photo', () => {
    expect(good({ reasonCode: 'missing_item' }).errors.description).toMatch(/describe/);
    expect(good({ reasonCode: 'missing_item', description: 'the charger was missing' }).ok).toBe(true);
    expect(good({ reasonCode: 'damaged' }).errors.photos).toMatch(/at least one photo/);
    const withPhoto = validateRequestForm({ type: 'return', reasonCode: 'damaged', lines: [line('i1', 1)], description: 'cracked' },
      { ...CTX, uploaded: [{ path: 'u/req-1/1-a.jpg', mime: 'image/jpeg', size: 1000 }] });
    expect(withPhoto.ok).toBe(true);
    expect(withPhoto.payload.p_evidence).toEqual([{ path: 'u/req-1/1-a.jpg', mime: 'image/jpeg', size: 1000 }]);
  });
  it('photos: type, size and count', () => {
    expect(good({ photos: [{ type: 'application/pdf', size: 10 }] }).errors.photos).toMatch(/JPEG, PNG or WebP/);
    expect(good({ photos: [{ type: 'image/jpeg', size: EVIDENCE_MAX_BYTES + 1 }] }).errors.photos).toMatch(/5 MB/);
    expect(good({ photos: Array.from({ length: 7 }, () => ({ type: 'image/jpeg', size: 10 })) }).errors.photos).toMatch(/At most 6/);
    expect(good({ photos: [{ type: 'image/jpeg', size: 10 }] }).ok).toBe(true);
  });
  it('description length and phone format', () => {
    expect(good({ description: 'x'.repeat(2001) }).errors.description).toMatch(/2000/);
    expect(good({ contactPhone: 'call me' }).errors.contactPhone).toMatch(/valid phone/);
    expect(good({ contactPhone: '98765-43210' }).ok).toBe(true);
  });
});

describe('mapRequestRow', () => {
  const row = {
    id: 'r1', request_no: 'RET-2026-000001', order_id: 'o1', user_id: 'u1', type: 'return', status: 'approved', reason_code: 'damaged', description: 'cracked', contact_phone: '98765',
    delivered_at: '2026-10-10T04:30:00Z', customer_note: 'Please keep the box', return_method: 'courier_pickup', return_instructions: 'A courier will call',
    decided_at: '2026-10-11T00:00:00Z', received_at: null, closed_at: null, created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-11T00:00:00Z',
    return_request_items: [{ id: 'ri1', order_item_id: 'i1', quantity: 1, unit_price: '500', item_status: 'approved', decision_note: null, price_difference: '-100.00', replacement_variant_id: '',
      policy_deadline: '2026-10-17T18:29:59.999Z', order_items: { title: 'Shirt [Pink]', product_title: 'Shirt', variant_name: 'Pink', image: 'p.jpg', quantity: 3 } }],
    return_request_evidence: [{ id: 'e1', storage_path: 'u1/r1/1-a.jpg', mime: 'image/jpeg', size_bytes: 1234, created_at: '2026-10-10T10:00:00Z' }],
    return_request_events: [
      { id: 'a', to_status: 'pending_review', actor_role: 'customer', created_at: '2026-10-10T10:00:00Z' },
      { id: 'b', from_status: 'pending_review', to_status: 'approved', actor_role: 'admin', note: 'ok', created_at: '2026-10-11T00:00:00Z' },
    ],
  };
  it('maps the request, its lines (with the order line embed), photos and a newest-first history', () => {
    const r = mapRequestRow(row);
    expect([r.requestNo, r.type, r.status, r.reasonCode, r.returnMethod, r.customerNote]).toEqual(['RET-2026-000001', 'return', 'approved', 'damaged', 'courier_pickup', 'Please keep the box']);
    expect([r.items[0].title, r.items[0].variantName, r.items[0].quantity, r.items[0].orderedQuantity, r.items[0].unitPrice, r.items[0].priceDifference]).toEqual(['Shirt', 'Pink', 1, 3, 500, -100]);
    expect(r.evidence).toEqual([{ id: 'e1', path: 'u1/r1/1-a.jpg', mime: 'image/jpeg', size: 1234, createdAt: '2026-10-10T10:00:00Z' }]);
    expect(r.events.map((e) => e.id)).toEqual(['b', 'a']);
    expect(r.internalNote).toBe('');
    expect(r.order).toBeNull();
  });
  it('reads the admin-only embeds when present (object or one-element array)', () => {
    const r = mapRequestRow({ ...row, return_request_private: [{ internal_note: 'VIP', decided_by: 'adm' }], orders: { id: 'o1', customer_name: 'Alice', payment_method: 'Razorpay', total: '999' } });
    expect([r.internalNote, r.decidedBy, r.order.customerName, r.order.paymentMethod, r.order.total]).toEqual(['VIP', 'adm', 'Alice', 'Razorpay', 999]);
    expect(mapRequestRow({ ...row, return_request_private: { internal_note: 'x' } }).internalNote).toBe('x');
  });
  it('null in, null out; tolerates missing embeds and an unknown line shape', () => {
    expect(mapRequestRow(null)).toBeNull();
    expect(mapRequestRows([null, row]).map((x) => x.id)).toEqual(['r1']);
    const bare = mapRequestRow({ id: 'r2', request_no: 'X', order_id: 'o', type: 'exchange', status: 'pending_review', reason_code: 'other' });
    expect([bare.items, bare.evidence, bare.events]).toEqual([[], [], []]);
    expect(mapRequestItem({ id: 'z', order_item_id: 'i', quantity: 1, unit_price: 1, item_status: 'pending' }).title).toBe('Item');
  });
  it('the select strings never ask the customer for admin-only tables', () => {
    expect(!REQUESTS_SELECT_CUSTOMER.includes('return_request_private') && !REQUESTS_SELECT_CUSTOMER.includes('orders(')).toBe(true);
    expect(REQUESTS_SELECT_ADMIN.includes('return_request_private') && REQUESTS_SELECT_ADMIN.includes('orders(')).toBe(true);
  });
  it('the customer lists the columns of a line one by one: the staff-only stock handling (disposition / stock_effect) is never asked for; the admin takes the whole row', () => {
    expect(/\*, return_request_items\(\*/.test(REQUESTS_COLUMNS_CUSTOMER)).toBe(false);
    expect(REQUESTS_COLUMNS_CUSTOMER.includes('disposition') || REQUESTS_COLUMNS_CUSTOMER.includes('stock_effect')).toBe(false);
    for (const c of ['item_status', 'decision_note', 'inspection_note', 'replacement_variant_id', 'price_difference', 'policy_deadline']) expect(REQUEST_ITEM_COLUMNS_CUSTOMER.includes(c)).toBe(true);
    expect(REQUESTS_SELECT_ADMIN.includes('return_request_items(*')).toBe(true);
    const i = mapRequestItem({ id: 'z', order_item_id: 'i', quantity: 1, unit_price: 1, item_status: 'passed', disposition: 'unsellable', stock_effect: 'unsellable' });
    expect([i.disposition, i.stockEffect]).toEqual(['unsellable', 'unsellable']);
    const c = mapRequestItem({ id: 'z', order_item_id: 'i', quantity: 1, unit_price: 1, item_status: 'passed' });
    expect([c.disposition, c.stockEffect]).toEqual(['', '']);
  });
});

describe('what each side may do', () => {
  const req = (status, o = {}) => ({ type: 'return', status, returnMethod: '', ...o });
  it('customer actions', () => {
    expect(['pending_review', 'needs_info', 'approved', 'awaiting_return_shipment', 'return_in_transit', 'inspection_pending', 'refunded', 'cancelled'].map((s) => canCustomerCancel(req(s))))
      .toEqual([true, true, true, true, false, false, false, false]);
    expect([canCustomerRespond(req('needs_info')), canCustomerRespond(req('pending_review')), canCustomerRespond(null)]).toEqual([true, false, false]);
    expect(canSubmitReturnTracking(req('awaiting_return_shipment', { returnMethod: 'customer_arranged' }))).toBe(true);
    expect(canSubmitReturnTracking(req('awaiting_return_shipment', { returnMethod: 'courier_pickup' }))).toBe(false);
    expect(canSubmitReturnTracking(req('approved', { returnMethod: 'customer_arranged' }))).toBe(false);
  });
  it('admin actions follow the state machine', () => {
    expect(adminActions(req('pending_review'))).toEqual(['decide', 'needs_info', 'cancel', 'message', 'note']);
    expect(adminActions(req('needs_info'))).toEqual(['decide', 'back_to_review', 'cancel', 'message', 'note']);
    expect(adminActions(req('approved'))).toEqual(['logistics', 'cancel', 'message', 'note']);
    expect(adminActions(req('awaiting_return_shipment'))).toEqual(['logistics', 'in_transit', 'received', 'cancel', 'message', 'note']);
    expect(adminActions(req('return_in_transit'))).toEqual(['received', 'cancel', 'message', 'note']);
    expect(adminActions(req('inspection_pending'))).toEqual(['inspect', 'message', 'note']);
    expect(adminActions(req('inspection_passed'))).toEqual(['refund', 'message', 'note']);
    expect(adminActions(req('refund_pending'))).toEqual(['refund', 'message', 'note']); // retry after a failed refund / check a pending one
    expect(adminActions(req('refund_pending', { type: 'exchange' }))).toEqual(['message', 'note']);
    expect(adminActions(req('inspection_passed', { type: 'exchange' }))).toEqual(['replacement_pending', 'message', 'note']);
    // the replacement steps (Phase 10): the panel ships / settles / delivers; an admin can still give up before it ships
    expect(adminActions(req('replacement_pending', { type: 'exchange' }))).toEqual(['replacement', 'cancel', 'message', 'note']);
    expect(adminActions(req('replacement_shipped', { type: 'exchange' }))).toEqual(['replacement', 'message', 'note']);
    expect(adminActions(req('replacement_delivered', { type: 'exchange' }))).toEqual(['replacement', 'close', 'message', 'note']);
    expect(adminActions(req('inspection_failed'))).toEqual(['close', 'message', 'note']);
    expect(adminActions(req('refunded'))).toEqual(['close', 'message', 'note']);
    for (const s of FINAL_STATUSES) expect(adminActions(req(s))).toEqual([]);
    expect(adminActions(null)).toEqual([]);
  });
});

describe('progress and summary', () => {
  const steps = (status, o = {}) => requestProgress({ type: 'return', status, ...o });
  const done = (s) => s.filter((x) => x.done).map((x) => x.key);
  it('a return: submitted, approved, received, checked, refund', () => {
    expect(steps('pending_review').map((s) => s.key)).toEqual(['submitted', 'approved', 'received', 'checked', 'refund']);
    expect(done(steps('pending_review'))).toEqual([]);
    expect(steps('pending_review').find((s) => s.current).key).toBe('submitted');
    expect(done(steps('approved'))).toEqual(['submitted']);
    expect(steps('awaiting_return_shipment').find((s) => s.current).key).toBe('approved');
    expect(done(steps('inspection_pending'))).toEqual(['submitted', 'approved']);
    expect(done(steps('refund_pending'))).toEqual(['submitted', 'approved', 'received', 'checked']);
    expect(done(steps('refunded'))).toEqual(['submitted', 'approved', 'received', 'checked', 'refund']);
  });
  it('an exchange ends with the replacement', () => {
    expect(requestProgress({ type: 'exchange', status: 'approved' }).at(-1).key).toBe('replacement');
  });
  it('a rejected / cancelled / failed request shows where it stopped', () => {
    expect(steps('rejected').find((s) => s.stopped).key).toBe('submitted');
    expect(steps('inspection_failed').find((s) => s.stopped).key).toBe('checked');
    expect(steps('refund_pending').some((s) => s.stopped)).toBe(false);
  });
  it('summary line', () => {
    expect(requestSummaryLine({ type: 'exchange', status: 'replacement_shipped' })).toBe('Exchange · Replacement on its way');
    expect(requestSummaryLine({ type: 'return', status: 'refunded' })).toBe('Return · Refund completed');
    expect(requestSummaryLine(null)).toBe('');
    expect(requestProgress(null).length).toBe(0);
  });
});