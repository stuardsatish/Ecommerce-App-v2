// Customer-side shipment reads for the RN app (the admin writes live on the website only).
//
// Orders are loaded WITH their shipments (courier, tracking number / link, history). When the server has not got the shipping
// migration yet (20261017_03_shipping.sql) PostgREST refuses the embed; `queryOrdersWithShipments` then falls back to the old
// select, so a new app build can ship before the SQL is applied and simply shows no tracking until it is.
// Twin of services/shipping/shippingService.js on the website (same function names, same rules; keep them in step).
import { SHIPMENTS_SELECT_CUSTOMER } from '@/utils/shipmentModel';

/** PostgREST says an embed does not exist when the shipping tables are not there yet. */
export function isMissingShipmentsRelation(error) {
  if (!error) return false;
  if (['PGRST200', 'PGRST205', '42P01'].includes(error.code)) return true;
  const m = String(error.message || '');
  return /shipments|shipment_/i.test(m) && /relationship|not find|does not exist/i.test(m);
}

/**
 * @param makeQuery (select: string) => PromiseLike<{ data, error }>
 *   e.g. (s) => supabase.from('orders').select(s).eq('user_id', uid)
 */
export async function queryOrdersWithShipments(makeQuery) {
  const first = await makeQuery(`*, order_items(*), ${SHIPMENTS_SELECT_CUSTOMER}`);
  if (!first.error || !isMissingShipmentsRelation(first.error)) return first;
  return makeQuery('*, order_items(*)');
}