// Ported from Ecommerce-sept-1-2026/src/utils/generateInvoice.js. The TAX
// CALCULATION logic (per-line GST/HSN math, HSN grouping, totals) is ported
// structurally verbatim — every fallback branch is kept even though, given
// this app's actual mapped-order-item shape (see the note below), several
// of them are currently unreachable. The RENDERING layer is NOT ported
// (jsPDF + jspdf-autotable draw a PDF via absolute-positioned text/table
// cells — there's no RN equivalent); per Unclear Item 7's resolution, this
// builds an HTML string and hands it to `expo-print` to rasterize into a
// real PDF, then opens the native share sheet via `expo-sharing`.
//
// IMPORTANT — confirmed by reading the source's own mapOrderRow (verbatim in
// this RN app's utils/mappers.js, Phase 4): mapped order-line-items never
// carry `price`/`originalPrice`/`gstRate`/`hsnCode`/`taxableValue`, and mapped
// ORDERS never carry `taxableTotal`/`isInterState`/`gstEnabled`. This means,
// on THIS app's real data (verified identical on the web app, which uses the
// exact same mapper — not something this port changed):
//   - `getItemFinalPrice`'s legacy-double-discount detection never fires
//     (mrp always resolves to 0 in that specific check) — `unit` is always
//     just `p.finalPrice`, and the "(`N`% off Rs.`mrp`)" name suffix never
//     appears.
//   - Every line's GST rate falls back to LEGACY_GST_RATE (18%), and HSN
//     always renders "-".
//   - `hasStoredGst` is always false, so the invoice always recomputes its
//     own CGST/SGST estimate from the line items rather than using the
//     order's own server-stored `totalCgst`/`totalSgst`/`totalIgst` (which
//     ARE present on the mapped order, just never read here because the
//     guard checks `taxableTotal`, a field that's never populated). This is
//     a latent inconsistency in the SOURCE app itself, not something this
//     port introduced — flagging it rather than silently "fixing" it by
//     switching the guard to read `totalCgst` instead, since that would be
//     a real behavior change to unrequested business logic.
// None of this is hand-simplified away below — the same conditional
// structure is kept so a future schema change (e.g. per-item gstRate/hsnCode
// starting to be stored) would activate correctly without a rewrite.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getInvoiceSettings } from '@/services/settingsService';

const COMPANY = {
  name: 'Nexus Commerce Pvt. Ltd.',
  address: '12 Industrial Layout, Whitefield, Bengaluru, Karnataka 560066',
  gstin: '29ABCDE1234F1Z5',
  state: 'Karnataka',
  email: 'support@nexuscommerce.in',
  phone: '+91 80 4000 1234',
};
const LEGACY_GST_RATE = 18;

const clean = (v, fallback = 'N/A') => {
  const s = String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .trim();
  return s === '' ? fallback : s;
};

/**
 * HTML-escape for text nodes. REQUIRED on every interpolated string in
 * `buildInvoiceHtml` — do not rely on `clean()` for this.
 *
 * `clean()` strips COMPLETE `<...>` tags, which is not the same as escaping:
 * an unterminated `<` survives it untouched (the `<[^>]*>` pattern needs a
 * closing `>`), and the next literal `>` in the template — e.g. the `>` of a
 * following `</p>` — then terminates the attacker's tag for them. A profile
 * name of `<img src=x onerror="…"` therefore reached the rendered invoice as
 * live markup. `&`, `"` and `'` were never handled at all.
 *
 * That mattered because the invoice's own inputs are partly user-controlled:
 * `userDetails.name` / `address` / `phone` come from the signed-in user's
 * editable profile, `order.userName` can be written by an admin order-create
 * flow, and product titles and the `settings` row (company name, logo,
 * footer, UPI id) are admin-controlled. On native the payload renders inside
 * expo-print's WebView; on the web target `generateAndShareInvoice` calls
 * `printWindow.document.write(html)` on an `about:blank` window, which
 * inherits the app's origin — so it executed same-origin with the session.
 *
 * Escape order matters: `&` first, or the other replacements' own ampersands
 * get double-escaped.
 */
export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Attribute-safe URL for the one `src="…"` in the template. Escaping alone
 * isn't enough for a URL context: `javascript:` and `data:text/html` are both
 * script-execution vectors that contain no characters `esc()` touches, so the
 * scheme is allowlisted first and anything else is dropped to empty.
 */
export const escUrl = (v) => {
  const raw = String(v ?? '').trim();
  if (!/^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(raw)) return '';
  return esc(raw);
};
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (d) =>
  d && !isNaN(d.getTime())
    ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'N/A';
const fileSafe = (s) =>
  String(s || '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'NA';

const formatAddress = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.replace(/<[^>]*>/g, '').trim();
  if (typeof v === 'object') {
    return [v.street, v.city, v.state, v.pincode, v.country]
      .map((s) => String(s ?? '').replace(/<[^>]*>/g, '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return '';
};

const getItemFinalPrice = (p) => {
  const mrp = Number(p.originalPrice ?? p.price ?? 0);
  const disc = Number(p.discount || 0);
  const stored = Number(p.finalPrice ?? p.price ?? 0);
  if (disc > 0 && stored >= mrp && mrp > 0) {
    return Math.round(mrp * (1 - disc / 100) * 100) / 100;
  }
  return stored || mrp;
};

/** Pure calculation pass — everything the HTML template needs, no rendering. */
export function computeInvoiceData(order, userDetails, settings) {
  const companyName = settings.companyName || COMPANY.name;
  const address = settings.address || COMPANY.address;
  const email = settings.email || COMPANY.email;
  const phone = settings.mobile || settings.phone || COMPANY.phone;
  const gstin = settings.gstin || COMPANY.gstin;
  const website = settings.website || '';
  const logo = settings.logo || '';

  const rawId = order.externalOrderId
    ? String(order.externalOrderId).replace(/^#/, '')
    : order.orderId || order.id || '';
  const now = new Date();
  const invDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const invoiceNo = `INV-${invDate}-${rawId}`;
  const orderDate = fmtDate(toDate(order.createdAt));
  const customerName = clean(userDetails.name || order.userName, 'Guest Customer');

  const products = Array.isArray(order.products) ? order.products : [];
  let itemsTotal = 0;

  const isGstDisabled =
    order.gstEnabled === false || (order.gstEnabled === undefined && settings.gstEnabled === false);
  const hasStoredGst = !isGstDisabled && order.taxableTotal != null;
  const interState = hasStoredGst
    ? !!order.isInterState
    : !!userDetails.state &&
      clean(userDetails.state, '').toLowerCase() !== (settings.state || COMPANY.state).toLowerCase();

  const lines = products.map((p, i) => {
    const qty = Number(p.quantity) || 1;
    const mrp = Number(p.originalPrice ?? p.price ?? p.finalPrice) || 0;
    const unit = getItemFinalPrice(p);
    const discAmt = Math.max(0, Number((mrp - unit).toFixed(2)));
    const discPct =
      discAmt > 0
        ? Number(p.discount) > 0
          ? `${Math.round(Number(p.discount))}%`
          : `${Math.round((discAmt / mrp) * 100)}%`
        : '0%';
    const lineTotal = unit * qty;
    itemsTotal += lineTotal;
    const gstRate = p.gstRate != null ? Number(p.gstRate) : LEGACY_GST_RATE;
    const taxableUnit = Number(p.taxableValue) || (gstRate > 0 ? (unit * 100) / (100 + gstRate) : unit);
    const taxable = taxableUnit * qty;
    const lineGst = round2((unit - taxableUnit) * qty);
    let cgst, sgst, igst;
    if (p.cgstAmount != null || p.sgstAmount != null || p.igstAmount != null) {
      cgst = Number(p.cgstAmount || 0);
      sgst = Number(p.sgstAmount || 0);
      igst = Number(p.igstAmount || 0);
    } else if (interState) {
      igst = lineGst;
      cgst = 0;
      sgst = 0;
    } else {
      cgst = Math.ceil((lineGst / 2) * 100) / 100;
      sgst = Math.floor((lineGst / 2) * 100) / 100;
      igst = 0;
    }
    const name =
      discAmt > 0
        ? `${clean(p.title, 'Item')} (${discPct} off ₹${mrp.toFixed(2)})`
        : clean(p.title, 'Item');
    return {
      idx: i + 1,
      name,
      hsn: clean(p.hsnCode, '-'),
      qty,
      unit,
      gstRate,
      taxable,
      cgst,
      sgst,
      igst,
      lineTotal,
    };
  });

  const groupMap = new Map();
  for (const l of lines) {
    const key = `${l.hsn}||${l.gstRate}`;
    const g = groupMap.get(key) || { hsn: l.hsn, rate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable += l.taxable;
    g.cgst += l.cgst;
    g.sgst += l.sgst;
    g.igst += l.igst;
    groupMap.set(key, g);
  }
  const taxGroups = [...groupMap.values()].sort((a, b) => a.rate - b.rate);

  const grand = Number(order.total) || itemsTotal;
  const promoDiscount = Number(order.promoDiscount ?? 0);
  const promoCode = order.promoCode || '';
  const storedShipping = Number(order.shipping ?? 0);
  const derivedShipping = Math.max(0, Math.round((grand - itemsTotal + promoDiscount) * 100) / 100);
  const shipping = storedShipping > 0 ? storedShipping : derivedShipping;
  const goodsValue = itemsTotal;

  let taxableTotal, totalCgst, totalSgst, totalIgst;
  if (hasStoredGst) {
    taxableTotal = Number(order.taxableTotal) || 0;
    totalCgst = Number(order.totalCgst || 0);
    totalSgst = Number(order.totalSgst || 0);
    totalIgst = Number(order.totalIgst || 0);
  } else {
    taxableTotal = goodsValue / (1 + LEGACY_GST_RATE / 100);
    const gstTotal = goodsValue - taxableTotal;
    if (interState) {
      totalIgst = gstTotal;
      totalCgst = 0;
      totalSgst = 0;
    } else {
      totalCgst = gstTotal / 2;
      totalSgst = gstTotal / 2;
      totalIgst = 0;
    }
  }

  const addr = clean(
    formatAddress(userDetails.address) ||
      formatAddress(order.userAddress) ||
      formatAddress(order.address) ||
      formatAddress(order.shippingAddress),
    'Address not on file'
  );
  const emailVal = clean(userDetails.email || order.userEmail);
  const phoneVal = clean(userDetails.phone || order.userPhone);

  const txnId = clean(order.razorpayPaymentId, '');
  const payMethodStr =
    String(order.paymentMethod || '').toLowerCase() === 'cod'
      ? 'Cash on Delivery (COD)'
      : clean(order.paymentMethod, 'N/A');
  const payStatusStr =
    String(order.paymentStatus || '').toLowerCase() === 'pending'
      ? 'UNPAID / PENDING ON DELIVERY'
      : clean(order.paymentStatus, 'N/A').toUpperCase();

  return {
    companyName,
    address,
    email,
    phone,
    gstin,
    website,
    logo,
    rawId,
    invoiceNo,
    invoiceDate: fmtDate(now),
    orderDate,
    customerName,
    addr,
    emailVal,
    phoneVal,
    lines,
    taxGroups,
    isGstDisabled,
    interState,
    taxableTotal,
    totalCgst,
    totalSgst,
    totalIgst,
    shipping,
    promoDiscount,
    promoCode,
    grand,
    txnId,
    payMethodStr,
    payStatusStr,
    footerTitle: settings.footerTitle || 'Thank You!',
    footerSubNote: settings.footerSubNote || '',
    supportEmail: settings.supportEmail || '',
    supportPhone: settings.supportPhone || '',
    upiId: settings.upiId || '',
  };
}

export function buildInvoiceHtml(d) {
  const itemRows = d.lines
    .map(
      (l) => `
      <tr>
        <td class="c">${l.idx}</td>
        <td>${esc(l.name)}</td>
        <td class="c">${esc(l.hsn)}</td>
        <td class="c">${l.qty}</td>
        <td class="r">${money(l.unit)}</td>
        <td class="c">${Math.round(l.gstRate)}%</td>
        <td class="r">${money(l.taxable)}</td>
        ${d.interState ? `<td class="r">${money(l.igst)}</td>` : `<td class="r">${money(l.cgst)}</td><td class="r">${money(l.sgst)}</td>`}
        <td class="r">${money(l.lineTotal)}</td>
      </tr>`
    )
    .join('');

  const taxRows = d.taxGroups
    .map((g) => {
      const totalTax = d.interState ? g.igst : g.cgst + g.sgst;
      return `<tr><td>${esc(g.hsn)}</td><td class="c">${Math.round(g.rate)}%</td><td class="r">${money(g.taxable)}</td>${
        d.interState
          ? `<td class="r">${money(g.igst)}</td>`
          : `<td class="r">${money(g.cgst)}</td><td class="r">${money(g.sgst)}</td>`
      }<td class="r">${money(totalTax)}</td></tr>`;
    })
    .join('');

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { font-family: Helvetica, Arial, sans-serif; color: #28283c; padding: 32px; font-size: 11px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #c7c4d7; padding-bottom: 12px; }
        .company { display: flex; gap: 12px; align-items: flex-start; }
        .company img { width: 40px; height: 40px; object-fit: contain; }
        .company h1 { font-size: 18px; color: #2814b4; margin: 0 0 4px; }
        .company p { margin: 2px 0; color: #46445c; }
        .invoice-meta { text-align: right; }
        .invoice-meta h2 { font-size: 16px; margin: 0 0 6px; }
        .invoice-meta p { margin: 2px 0; color: #46445c; }
        .addresses { display: flex; justify-content: space-between; margin-top: 16px; gap: 24px; }
        .addresses div { flex: 1; }
        .addresses h3 { font-size: 10px; letter-spacing: 0.5px; margin: 0 0 6px; }
        .addresses p { margin: 2px 0; color: #46445c; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 9px; }
        th, td { border: 0.5px solid #e1e0eb; padding: 5px 6px; text-align: left; }
        th { background: #2814b4; color: #fff; }
        .c { text-align: center; }
        .r { text-align: right; }
        .summary-row { display: flex; justify-content: flex-end; margin-top: 16px; }
        .summary { width: 260px; }
        .summary .row { display: flex; justify-content: space-between; padding: 3px 0; }
        .summary .grand { border-top: 1px dashed #c7c4d7; margin-top: 6px; padding-top: 6px; font-weight: bold; color: #2814b4; font-size: 13px; }
        .payment { margin-top: 16px; }
        .payment p { margin: 2px 0; }
        .footer { border-top: 1px dashed #c7c4d7; margin-top: 24px; padding-top: 12px; }
        .footer h4 { color: #2814b4; margin: 0 0 4px; }
        .disclaimer { color: #96969f; font-size: 8px; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company">
          ${escUrl(d.logo) ? `<img src="${escUrl(d.logo)}" />` : ''}
          <div>
            <h1>${esc(d.companyName)}</h1>
            <p>${esc(d.address)}</p>
            <p>${[d.email, d.phone, d.website].filter(Boolean).map(esc).join(' | ')}</p>
            <p>GSTIN: ${esc(d.gstin)}</p>
          </div>
        </div>
        <div class="invoice-meta">
          <h2>TAX INVOICE</h2>
          <p>Invoice No: ${esc(d.invoiceNo)}</p>
          <p>Invoice Date: ${esc(d.invoiceDate)}</p>
          <p>Order Date: ${esc(d.orderDate)}</p>
        </div>
      </div>

      <div class="addresses">
        <div>
          <h3>BILL TO</h3>
          <p>${esc(d.customerName)}</p>
          <p>${esc(d.emailVal)}</p>
          <p>${esc(d.phoneVal)}</p>
          <p>${esc(d.addr)}</p>
        </div>
        <div>
          <h3>SHIP TO</h3>
          <p>${esc(d.customerName)}</p>
          <p>${esc(d.phoneVal)}</p>
          <p>${esc(d.addr)}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="c">#</th><th>Product</th><th class="c">HSN</th><th class="c">Qty</th>
            <th class="r">Unit</th><th class="c">GST</th><th class="r">Taxable</th>
            ${d.interState ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}
            <th class="r">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      ${
        !d.isGstDisabled
          ? `
      <h3 style="margin-top:16px;">TAX SUMMARY</h3>
      <table>
        <thead>
          <tr>
            <th>HSN/SAC</th><th class="c">Rate</th><th class="r">Taxable</th>
            ${d.interState ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}
            <th class="r">Total Tax</th>
          </tr>
        </thead>
        <tbody>${taxRows}</tbody>
      </table>`
          : ''
      }

      <div class="summary-row">
        <div class="summary">
          <div class="row"><span>Subtotal (Taxable)</span><span>${money(d.taxableTotal)}</span></div>
          ${
            d.interState
              ? `<div class="row"><span>IGST</span><span>${money(d.totalIgst)}</span></div>`
              : `<div class="row"><span>CGST</span><span>${money(d.totalCgst)}</span></div><div class="row"><span>SGST</span><span>${money(d.totalSgst)}</span></div>`
          }
          <div class="row"><span>Shipping</span><span>${d.shipping === 0 ? 'FREE' : money(d.shipping)}</span></div>
          ${
            d.promoDiscount > 0
              ? `<div class="row"><span>Promo Discount${d.promoCode ? ` (${esc(d.promoCode)})` : ''}</span><span>-${money(d.promoDiscount)}</span></div>`
              : ''
          }
          <div class="row grand"><span>Grand Total</span><span>${money(d.grand)}</span></div>
        </div>
      </div>

      <div class="payment">
        <p><strong>Payment Method:</strong> ${esc(d.payMethodStr)}</p>
        <p><strong>Payment Status:</strong> ${esc(d.payStatusStr)}</p>
        ${d.txnId ? `<p><strong>Transaction ID:</strong> ${esc(d.txnId)}</p>` : ''}
      </div>

      <div class="footer">
        <h4>${esc(d.footerTitle)}</h4>
        ${d.footerSubNote ? `<p>${esc(d.footerSubNote)}</p>` : ''}
        ${d.supportEmail || d.supportPhone ? `<p>Need help? ${d.supportEmail ? `Email ${esc(d.supportEmail)}` : ''}${d.supportEmail && d.supportPhone ? ' or ' : ''}${d.supportPhone ? `Call ${esc(d.supportPhone)}` : ''}</p>` : ''}
        ${d.upiId ? `<p>UPI ID: ${esc(d.upiId)}</p>` : ''}
        <p class="disclaimer">This is a computer-generated invoice and does not require a signature.</p>
      </div>
    </body>
  </html>`;
}

/**
 * Generates the invoice PDF and opens the native share sheet — the RN
 * equivalent of the web app's `doc.save(filename)` browser download
 * (Unclear Item 7, resolved: Option A, `expo-print`). Note the generated
 * temp file's name isn't the source's `Invoice_<id>_<name>.pdf` pattern —
 * expo-print controls that internally; renaming it would need
 * `expo-file-system` as an extra dependency for a purely cosmetic gap, not
 * pulled in for that alone.
 */
export async function generateAndShareInvoice(order, userDetails = {}) {
  if (!order) return;
  let settings = {};
  try {
    settings = (await getInvoiceSettings()) || {};
  } catch (err) {
    console.error('Error fetching invoice settings:', err);
  }
  const data = computeInvoiceData(order, userDetails, settings);
  const html = buildInvoiceHtml(data);

  // expo-print's web shim doesn't generate a file at all — printToFileAsync()
  // just calls window.print() on the CURRENT page and resolves to undefined
  // (no `{ uri }`), so the native flow below can't run on web. Open the
  // invoice in its own tab and print from there instead — the standard
  // browser "print / Save as PDF" pattern.
  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return; // popup blocked
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
  return uri;
}

// Exported for reuse where the filename convention matters (currently
// nowhere — kept for parity with the source's naming helper).
export const invoiceFilename = (order, customerName) =>
  `Invoice_${fileSafe(order?.id || order?.orderId)}_${fileSafe(customerName)}.pdf`;