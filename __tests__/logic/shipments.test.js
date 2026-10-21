// src/services/shipments.js: orders are loaded with their shipments, and fall back to the old select when the server has no shipping tables yet.
// (Twin of queryOrdersWithShipments in the website's services/shipping/shippingService.js, tested there as well.)
const { isMissingShipmentsRelation, queryOrdersWithShipments } = require('@/services/shipments');

describe('isMissingShipmentsRelation', () => {
  it('recognises a server without the shipping tables', () => {
    expect(isMissingShipmentsRelation({ code: 'PGRST200', message: "Could not find a relationship between 'orders' and 'shipments'" })).toBe(true);
    expect(isMissingShipmentsRelation({ code: 'PGRST205' })).toBe(true);
    expect(isMissingShipmentsRelation({ message: 'relation "public.shipments" does not exist' })).toBe(true);
    expect(isMissingShipmentsRelation({ code: '42501', message: 'permission denied for table orders' })).toBe(false);
    expect(isMissingShipmentsRelation(null)).toBe(false);
  });
});

describe('queryOrdersWithShipments', () => {
  it('asks for the customer-safe shipment embeds first (never the admin-only table)', async () => {
    const seen = [];
    await queryOrdersWithShipments(async (s) => {
      seen.push(s);
      return { data: [], error: null };
    });
    expect(seen[0]).toContain('shipments(');
    expect(seen[0]).not.toContain('shipment_private');
    expect(seen[0]).not.toMatch(/shipment_events\(\*/);
  });
  it('falls back to the old select when the server has no shipping tables yet', async () => {
    const seen = [];
    const r = await queryOrdersWithShipments(async (s) => {
      seen.push(s);
      return s.includes('shipments(')
        ? { data: null, error: { code: 'PGRST200', message: 'no relationship' } }
        : { data: [{ id: 'o1' }], error: null };
    });
    expect(seen[1]).toBe('*, order_items(*)');
    expect(r.data).toEqual([{ id: 'o1' }]);
  });
  it('does NOT swallow other errors', async () => {
    let calls = 0;
    const r = await queryOrdersWithShipments(async () => {
      calls += 1;
      return { data: null, error: { code: '42501', message: 'permission denied for table orders' } };
    });
    expect(calls).toBe(1);
    expect(r.error.code).toBe('42501');
  });
});

describe('mapOrderRow carries the shipping fields', () => {
  const { mapOrderRow } = require('@/utils/mappers');
  it('maps delivered_at and the embedded shipments', () => {
    const o = mapOrderRow({
      id: 'o1', order_status: 'shipped', delivered_at: null, delivered_at_source: null,
      order_items: [],
      shipments: [{ id: 's1', order_id: 'o1', status: 'in_transit', courier_name: 'DTDC', tracking_number: 'A1', shipment_items: [], shipment_events: [] }],
    });
    expect(o.shipments).toHaveLength(1);
    expect([o.shipments[0].courierName, o.shipments[0].trackingNumber, o.shipments[0].status]).toEqual(['DTDC', 'A1', 'in_transit']);
    expect([o.deliveredAt, o.deliveredAtSource]).toEqual([null, '']);
  });
  it('an order from a server without shipping has no shipments and nothing breaks', () => {
    const o = mapOrderRow({ id: 'o2', order_status: 'delivered', delivered_at: '2026-10-01T10:00:00Z', order_items: [] });
    expect(o.shipments).toEqual([]);
    expect(o.deliveredAt).toBe('2026-10-01T10:00:00Z');
  });
});