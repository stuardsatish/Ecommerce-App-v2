// Customer-side returns / exchanges service for the RN app: the ONE place the app talks to the request tables / RPCs / the private
// evidence bucket (migrations 20261017_04_return_requests.sql, 20261017_05_return_workflow.sql, 20261017_06_refunds.sql, 20261017_07_exchange_fulfilment.sql).
//
// Twin of the CUSTOMER half of the website's services/returns/returnsService.js - same function names, same rules, keep them in step.
// The admin half does not exist here, by design: this app has no admin screens. The Supabase client is INJECTED (createReturnsService(client)),
// so the website's own test file (src/services/returns/__tests__/returnsService.test.mjs) is run against THIS file with a fake client by
// tools/browser-test/Run-RnParity.ps1 - that is the sync-by-test rule (HANDOFF section 6.5).
//
// When the server has not got the returns migrations yet, every read answers "nothing" (null / []) and every write says so in plain words,
// so a new app build can ship before the SQL is applied and the screens simply stay hidden.
import { supabase } from '@/lib/supabase';
import {
  ADJUSTMENT_COLUMNS_CUSTOMER,
  REPLACEMENT_COLUMNS_CUSTOMER,
  buildReplacementMap,
  mapAdjustmentRows,
  mapFulfilmentRows,
} from '@/utils/exchangeModel';
import { REFUNDS_COLUMNS_CUSTOMER, REFUNDS_COLUMNS_ORDER, mapRefundRows } from '@/utils/refundModel';
import { EVIDENCE_MAX_FILES, REQUESTS_COLUMNS_CUSTOMER, evidenceFileError, evidencePath, mapRequestRows } from '@/utils/requestModel';
import { SHIPMENT_EVENT_COLUMNS, mapShipmentRows } from '@/utils/shipmentModel';

export const EVIDENCE_BUCKET = 'return-evidence';

/** A PostgREST / storage error -> an Error whose message is fit for a toast. The database messages are already readable. */
export function toReturnsError(err) {
  const e = new Error(friendly(err));
  e.code = err?.code || '';
  e.detail = err?.details || err?.detail || '';
  e.original = err;
  return e;
}
function friendly(err) {
  const code = err?.code;
  const msg = String(err?.message || 'Something went wrong');
  if (code === 'PGRST202' || code === '42883') return 'Returns are not available on the server yet: the database update (returns migration) has not been applied.';
  if (code === '23505') return 'A request for one of these items already exists.';
  if (code === '42501' && /permission denied/i.test(msg)) return 'You do not have permission to do that.';
  return msg;
}

/** True while the returns tables / functions are missing on the server (SQL not applied yet): screens hide the feature instead of failing. */
export function isReturnsUnavailable(error) {
  if (!error) return false;
  if (['PGRST202', 'PGRST205', '42883', '42P01', '42703'].includes(error.code)) return true; // 42703 = a column of a newer migration is missing
  const m = String(error.message || '');
  return /(get_order_eligibility|return_requests|request_reasons)/i.test(m) && /not find|does not exist|schema cache/i.test(m);
}

export function createReturnsService(client) {
  const unwrap = (res) => {
    if (res.error) throw toReturnsError(res.error);
    return res.data;
  };
  const rpc = async (name, args) => unwrap(await client.rpc(name, args));

  return {
    /** get_order_eligibility(): what every line of the order can do. Returns null when the feature is not on the server yet. */
    async eligibility(orderId) {
      const res = await client.rpc('get_order_eligibility', { p_order_id: orderId });
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return null;
        throw toReturnsError(res.error);
      }
      return res.data;
    },
    /** the configurable reasons (active ones; the admin sees all) */
    async reasons() {
      const res = await client
        .from('request_reasons')
        .select('code, label, applies_to, seller_fault, requires_evidence, requires_description, active, sort_order')
        .order('sort_order', { ascending: true });
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return [];
        throw toReturnsError(res.error);
      }
      return res.data || [];
    },
    /**
     * Uploads the photos to <uid>/<request id>/<n>-<name>.<ext> in the PRIVATE bucket. `files` = [{ name, type, size, body }]
     * (body: ArrayBuffer / Blob). All-or-nothing: if one fails the ones already stored are removed again.
     * Returns [{ path, mime, size }] for create_return_request().
     */
    async uploadEvidence({ uid, requestId, files, startIndex = 0 }) {
      const list = files || [];
      if (list.length + startIndex > EVIDENCE_MAX_FILES) throw new Error(`At most ${EVIDENCE_MAX_FILES} photos`);
      for (const f of list) {
        const bad = evidenceFileError(f);
        if (bad) throw new Error(bad);
      }
      const stored = [];
      try {
        for (let i = 0; i < list.length; i++) {
          // startIndex = photos already stored for this request, so an extra photo never reuses an earlier file name
          const path = evidencePath(uid, requestId, startIndex + i, list[i]);
          const { error } = await client.storage.from(EVIDENCE_BUCKET).upload(path, list[i].body, { contentType: list[i].type, upsert: false });
          if (error) throw toReturnsError(error);
          stored.push({ path, mime: list[i].type, size: list[i].size });
        }
      } catch (e) {
        if (stored.length) await client.storage.from(EVIDENCE_BUCKET).remove(stored.map((s) => s.path)).catch(() => {});
        throw e;
      }
      return stored;
    },
    /** removes uploads that never became a request (the policy only allows this for unsubmitted files) */
    async discardEvidence(paths) {
      if (!paths || !paths.length) return;
      await client.storage.from(EVIDENCE_BUCKET).remove(paths).catch(() => {});
    },
    /** `payload` = validateRequestForm(...).payload. Idempotent on p_request_id. */
    async submit(payload) {
      const d = await rpc('create_return_request', payload);
      return { created: !!d.created, requestId: d.request_id, requestNo: d.request_no, status: d.status };
    },
    async cancel(requestId, note = null) {
      const d = await rpc('cancel_return_request', { p_request_id: requestId, p_note: note || null });
      return { already: !!d.already, status: d.status };
    },
    async respond(requestId, message, evidence = []) {
      const d = await rpc('respond_to_request', { p_request_id: requestId, p_message: message || null, p_evidence: evidence });
      return { status: d.status };
    },
    /** "I sent it myself": courier + tracking number of the parcel (customer-arranged returns) */
    async submitReturnTracking({ requestId, courierName, trackingNumber = null, trackingUrl = null, shippedAt = null }) {
      const d = await rpc('customer_submit_return_shipment', {
        p_request_id: requestId,
        p_courier_name: courierName,
        p_tracking_number: trackingNumber || null,
        p_tracking_url: trackingUrl || null,
        p_shipped_at: shippedAt,
      });
      return { status: d.status, shipmentId: d.shipment_id };
    },
    /** this customer's requests for ONE order (newest first) with lines, photos (paths) and the customer-visible history */
    async listForOrder(orderId) {
      const res = await client.from('return_requests').select(REQUESTS_COLUMNS_CUSTOMER).eq('order_id', orderId).order('created_at', { ascending: false });
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return [];
        throw toReturnsError(res.error);
      }
      return mapRequestRows(res.data);
    },
    /** all of this customer's requests, newest first */
    async listMine() {
      const res = await client.from('return_requests').select(REQUESTS_COLUMNS_CUSTOMER).order('created_at', { ascending: false });
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return [];
        throw toReturnsError(res.error);
      }
      return mapRequestRows(res.data);
    },
    /** the return parcels of these requests as the CUSTOMER may see them (courier, tracking, pickup reference, history; never charges) */
    async returnShipmentsFor(requestIds) {
      if (!requestIds || !requestIds.length) return [];
      const res = await client
        .from('shipments')
        .select(`*, shipment_items(order_item_id, quantity), shipment_events(${SHIPMENT_EVENT_COLUMNS})`)
        .in('request_id', requestIds)
        .eq('direction', 'return');
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return [];
        throw toReturnsError(res.error);
      }
      return mapShipmentRows(res.data);
    },
    /** the refunds of these requests as the CUSTOMER may see them (amounts, state, reference, a safe failure reason; never the staff notes) */
    async refundsForRequests(requestIds) {
      if (!requestIds || !requestIds.length) return [];
      const res = await client
        .from('refunds')
        .select(REFUNDS_COLUMNS_CUSTOMER)
        .in('request_id', requestIds)
        .order('created_at', { ascending: false });
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return [];
        throw toReturnsError(res.error);
      }
      return mapRefundRows(res.data);
    },
    /** the refunds of ONE order that belong to no return request (a cancelled order, an exchange cancelled after the item came back), newest first, with the customer-readable reason */
    async refundsForOrder(orderId) {
      if (!orderId) return [];
      const res = await client
        .from('refunds')
        .select(REFUNDS_COLUMNS_ORDER)
        .eq('order_id', orderId)
        .eq('kind', 'order')
        .order('created_at', { ascending: false });
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return [];
        throw toReturnsError(res.error);
      }
      return mapRefundRows(res.data);
    },
    /** why this order was cancelled (what the customer was told), or null when it was not cancelled through the app / the feature is not on the server yet */
    async cancellationForOrder(orderId) {
      if (!orderId) return null;
      const res = await client.from('order_cancellations').select('order_id, reason, refund_id, cancelled_at').eq('order_id', orderId);
      if (res.error) {
        if (isReturnsUnavailable(res.error)) return null;
        throw toReturnsError(res.error);
      }
      const row = (res.data || [])[0];
      return row ? { orderId: row.order_id, reason: row.reason, refundId: row.refund_id || null, cancelledAt: row.cancelled_at || null } : null;
    },
    /**
     * The replacement of these EXCHANGES as the CUSTOMER may see it: { [requestId]: { fulfilment, adjustment, shipment } } - the replacement record with its lines,
     * the price difference, and the live replacement parcel (courier, tracking; never charges). The stock reservations and the staff notes are never selected.
     * Returns {} while the exchange tables are missing on the server (the SQL is not applied yet).
     */
    async replacementsFor(requestIds) {
      if (!requestIds || !requestIds.length) return {};
      const [f, a, s] = await Promise.all([
        client.from('replacement_fulfillments').select(REPLACEMENT_COLUMNS_CUSTOMER).in('request_id', requestIds),
        client.from('exchange_adjustments').select(ADJUSTMENT_COLUMNS_CUSTOMER).in('request_id', requestIds),
        client
          .from('shipments')
          .select(`*, shipment_items(order_item_id, quantity), shipment_events(${SHIPMENT_EVENT_COLUMNS})`)
          .in('request_id', requestIds)
          .eq('direction', 'replacement'),
      ]);
      for (const res of [f, a, s]) {
        if (res.error) {
          if (isReturnsUnavailable(res.error)) return {};
          throw toReturnsError(res.error);
        }
      }
      return buildReplacementMap(mapFulfilmentRows(f.data), mapAdjustmentRows(a.data), mapShipmentRows(s.data));
    },
    /** short-lived links for the private photos: { [path]: url } */
    async signedEvidenceUrls(paths, expiresIn = 3600) {
      if (!paths || !paths.length) return {};
      const { data, error } = await client.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, expiresIn);
      if (error) throw toReturnsError(error);
      return Object.fromEntries((data || []).filter((d) => d && d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },
  };
}

export const returnsService = createReturnsService(supabase);