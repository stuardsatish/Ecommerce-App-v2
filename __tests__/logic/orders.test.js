/**
 * Order presentation helpers, row mapping, and payment labels.
 *
 * `statusMeta` is worth testing carefully because its `icon` field is now an
 * `@/components/Icon` NAME rather than the source's short discriminator, and
 * its `tone` is a key into `constants/theme`. A typo in either renders nothing
 * (Icon warns and returns null) or an undefined colour — both silent at
 * runtime. These tests pin the contract to the actual icon map and theme.
 */
const { orderNo, statusMeta } = require('@/utils/orders');
const { mapProductRow, mapProductRows, mapOrderRow } = require('@/utils/mappers');
const {
  paymentMethodLabel,
  paymentStatusLabel,
  isCodPending,
  isPendingPayment,
} = require('@/utils/paymentLabels');
const { Colors } = require('@/constants/theme');

describe('orderNo', () => {
  it('prefers externalOrderId and strips a leading #', () => {
    expect(orderNo({ externalOrderId: '#AB-1001', id: 'uuid' })).toBe('AB-1001');
    expect(orderNo({ externalOrderId: 'AB-1001' })).toBe('AB-1001');
  });

  it('falls back to id then orderId', () => {
    expect(orderNo({ id: 'uuid-1' })).toBe('uuid-1');
    expect(orderNo({ orderId: 'ord-2' })).toBe('ord-2');
  });

  it('returns an empty string for no order', () => {
    expect(orderNo(null)).toBe('');
    expect(orderNo({})).toBe('');
  });
});

describe('statusMeta', () => {
  const cases = [
    ['delivered', 'DELIVERED', 'Delivered', 'check-circle-2', 'success'],
    ['cancelled', 'CANCELLED', 'Cancelled', 'x-circle', 'error'],
    ['shipped', 'IN_TRANSIT', 'In Transit', 'truck', 'infoFg'],
    ['placed', 'PROCESSING', 'Processing', 'truck', 'info'],
    ['confirmed', 'PROCESSING', 'Processing', 'truck', 'info'],
  ];

  it.each(cases)('maps %s correctly', (status, key, label, icon, tone) => {
    const m = statusMeta({ orderStatus: status });
    expect(m).toMatchObject({ key, label, icon, tone });
  });

  it('is case-insensitive', () => {
    expect(statusMeta({ orderStatus: 'DELIVERED' }).key).toBe('DELIVERED');
    expect(statusMeta({ orderStatus: 'Cancelled' }).key).toBe('CANCELLED');
  });

  it('defaults unknown and missing statuses to PROCESSING', () => {
    expect(statusMeta({ orderStatus: 'banana' }).key).toBe('PROCESSING');
    expect(statusMeta({}).key).toBe('PROCESSING');
    expect(statusMeta(null).key).toBe('PROCESSING');
  });

  it('returns a tone that exists in BOTH theme palettes', () => {
    // A missing key yields `undefined`, which vector-icons renders as the
    // platform default colour — visually wrong but never an error.
    for (const [status] of cases) {
      const { tone } = statusMeta({ orderStatus: status });
      expect(Colors.light).toHaveProperty(tone);
      expect(Colors.dark).toHaveProperty(tone);
      expect(typeof Colors.light[tone]).toBe('string');
    }
  });

  it('returns className fragments, not raw CSS var strings', () => {
    // RN has no CSS cascade to resolve var(--color-*) against.
    for (const [status] of cases) {
      const m = statusMeta({ orderStatus: status });
      expect(m.bg).toMatch(/^bg-/);
      expect(m.text).toMatch(/^text-/);
      expect(m.bg).not.toContain('var(');
    }
  });
});

describe('paymentMethodLabel / paymentStatusLabel', () => {
  it('expands known methods', () => {
    expect(paymentMethodLabel('cod')).toBe('Cash on Delivery (COD)');
    expect(paymentMethodLabel('COD')).toBe('Cash on Delivery (COD)');
    expect(paymentMethodLabel('razorpay')).toBe('Razorpay');
    expect(paymentMethodLabel('whatsapp')).toBe('WhatsApp');
  });

  it('passes an unknown method through, N/A when blank', () => {
    expect(paymentMethodLabel('upi')).toBe('upi');
    expect(paymentMethodLabel('')).toBe('N/A');
    expect(paymentMethodLabel(null)).toBe('N/A');
  });

  it('qualifies pending by method', () => {
    expect(paymentStatusLabel('pending', 'cod')).toBe('Pending (Pay on Delivery)');
    expect(paymentStatusLabel('pending', 'whatsapp')).toBe('Pending (WhatsApp)');
    expect(paymentStatusLabel('pending', 'razorpay')).toBe('Pending');
    expect(paymentStatusLabel('pending')).toBe('Pending');
  });

  it('normalises paid and passes anything else through', () => {
    expect(paymentStatusLabel('paid')).toBe('Paid');
    expect(paymentStatusLabel('PAID')).toBe('Paid');
    expect(paymentStatusLabel('refunded')).toBe('refunded');
    expect(paymentStatusLabel('')).toBe('N/A');
  });
});

describe('isCodPending / isPendingPayment', () => {
  it('isCodPending is COD + pending only', () => {
    expect(isCodPending({ paymentMethod: 'cod', paymentStatus: 'pending' })).toBe(true);
    expect(isCodPending({ paymentMethod: 'COD', paymentStatus: 'PENDING' })).toBe(true);
    expect(isCodPending({ paymentMethod: 'cod', paymentStatus: 'paid' })).toBe(false);
    expect(isCodPending({ paymentMethod: 'whatsapp', paymentStatus: 'pending' })).toBe(false);
    expect(isCodPending(null)).toBe(false);
  });

  it('isPendingPayment also covers WhatsApp', () => {
    expect(isPendingPayment({ paymentMethod: 'whatsapp', paymentStatus: 'pending' })).toBe(true);
    expect(isPendingPayment({ paymentMethod: 'cod', paymentStatus: 'pending' })).toBe(true);
    expect(isPendingPayment({ paymentMethod: 'razorpay', paymentStatus: 'pending' })).toBe(false);
  });
});

describe('mapProductRow', () => {
  it('normalises snake_case to camelCase with safe defaults', () => {
    const p = mapProductRow({
      id: 'p1',
      title: 'Bar',
      short_description: 'short',
      price: '499.5',
      discount: '10',
      discount_expiry: '2026-12-31',
      gst_rate: '18',
      hsn_code: '1806',
      stock: '7',
      has_variants: 1,
      variants: [{ id: 'var_1' }],
      image: 'img.png',
    });
    expect(p).toMatchObject({
      id: 'p1',
      productId: 'p1',
      shortDescription: 'short',
      price: 499.5,
      discount: 10,
      gstRate: 18,
      hsnCode: '1806',
      stock: 7,
      hasVariants: true,
    });
    // thumbnail falls back to image
    expect(p.thumbnail).toBe('img.png');
  });

  it('defaults every optional field rather than leaving undefined', () => {
    const p = mapProductRow({ id: 'p2' });
    expect(p.title).toBe('');
    expect(p.price).toBe(0);
    expect(p.stock).toBe(0);
    expect(p.gallery).toEqual([]);
    expect(p.variants).toEqual([]);
    expect(p.attributes).toEqual([]);
    expect(p.status).toBe('active');
    expect(p.hasVariants).toBe(false);
  });

  it('coerces a non-array variants/attributes column to an array', () => {
    const p = mapProductRow({ id: 'p3', variants: null, attributes: 'oops' });
    expect(p.variants).toEqual([]);
    expect(p.attributes).toEqual([]);
  });

  it('passes null/undefined straight through', () => {
    expect(mapProductRow(null)).toBeNull();
    expect(mapProductRows(null)).toEqual([]);
    expect(mapProductRows([{ id: 'a' }, { id: 'b' }])).toHaveLength(2);
  });
});

describe('mapOrderRow', () => {
  it('maps customer_* to user* and exposes address under every alias', () => {
    const addr = { street: '1 MG Rd', city: 'Bengaluru' };
    const o = mapOrderRow({
      id: 'o1',
      user_id: 'u1',
      order_status: 'shipped',
      payment_status: 'paid',
      payment_method: 'razorpay',
      customer_name: 'Asha',
      customer_email: 'a@b.co',
      customer_phone: '900',
      address: addr,
      order_items: [
        { product_id: 'p1', title: 'Bar', quantity: '2', unit_price: '250', line_total: '500' },
      ],
    });
    expect(o).toMatchObject({
      id: 'o1',
      orderStatus: 'shipped',
      userName: 'Asha',
      userEmail: 'a@b.co',
      userPhone: '900',
    });
    expect(o.address).toBe(addr);
    expect(o.userAddress).toBe(addr);
  });

  it('maps unit_price to finalPrice and does NOT expose a price field', () => {
    // Deliberate: exposing `price` would re-activate the admin
    // resolvedFinalPrice double-discount branch on already-discounted rows.
    const o = mapOrderRow({
      id: 'o2',
      order_items: [{ product_id: 'p1', quantity: 1, unit_price: 199, discount: 10 }],
    });
    expect(o.products[0].finalPrice).toBe(199);
    expect(o.products[0]).not.toHaveProperty('price');
    expect(o.products[0]).not.toHaveProperty('originalPrice');
  });

  it('defaults status fields and quantity', () => {
    const o = mapOrderRow({ id: 'o3', order_items: [{ product_id: 'p', unit_price: 0 }] });
    expect(o.orderStatus).toBe('placed');
    expect(o.paymentStatus).toBe('pending');
    expect(o.products[0].quantity).toBe(1);
  });

  it('handles an order with no items', () => {
    const o = mapOrderRow({ id: 'o4' });
    expect(o.products).toEqual([]);
  });

  it('passes null through', () => {
    expect(mapOrderRow(null)).toBeNull();
  });
});