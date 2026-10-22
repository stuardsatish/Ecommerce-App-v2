// Pure helpers for the address book (roadmap task 4.2). Kept free of supabase /
// React so they can be unit-tested in plain Node; `@/services/addresses`
// re-exports them under the names the web app's twin module uses.
//
// The rules mirror the shared contract (Phase 4): the database only enforces
// column lengths, so the "is this a real address" checks live here.

export const ADDRESS_LIMIT = 10;
export const LABEL_PRESETS = ['Home', 'Work', 'Other'];

const MAX = { label: 30, fullName: 100, line1: 200, line2: 200, landmark: 100, city: 80, state: 80 };

export const EMPTY_ADDRESS = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  isDefault: false,
};

const text = (v) => String(v ?? '').trim();

/**
 * Digits only, without the country code. Accepts "98765 43210", "98765-43210",
 * "+91 98765 43210", "(+91) 9876543210". Only a 12-digit run that starts with
 * 91 is treated as carrying the country code — a plain 10-digit number may
 * perfectly well begin with 91 (e.g. 9123456789).
 */
export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

/** "9876543210" -> "+91 98765 43210"; anything else is shown as stored. */
export function formatPhone(phone) {
  const p = normalizePhone(phone);
  return p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : text(phone);
}

/**
 * @param {object} fields camelCase address fields (see EMPTY_ADDRESS)
 * @returns {{ ok: boolean, errors: Record<string,string> }}
 */
export function validateAddress(fields) {
  const f = fields || {};
  const errors = {};

  const label = text(f.label);
  if (!label) errors.label = 'Enter a label for this address.';
  else if (label.length > MAX.label) errors.label = `Label can be at most ${MAX.label} characters.`;

  const fullName = text(f.fullName);
  if (fullName.length < 2) errors.fullName = "Enter the recipient's full name (at least 2 characters).";
  else if (fullName.length > MAX.fullName) errors.fullName = `Name can be at most ${MAX.fullName} characters.`;

  if (normalizePhone(f.phone).length !== 10) errors.phone = 'Enter a valid 10-digit mobile number.';

  const line1Raw = String(f.line1 ?? '');
  const line1 = line1Raw.trim();
  if (line1Raw.length < 3 || line1.length < 2) errors.line1 = 'Enter your house / flat number and street (at least 3 characters).';
  else if (line1.length > MAX.line1) errors.line1 = `Address can be at most ${MAX.line1} characters.`;

  if (text(f.line2).length > MAX.line2) errors.line2 = `This line can be at most ${MAX.line2} characters.`;
  if (text(f.landmark).length > MAX.landmark) errors.landmark = `Landmark can be at most ${MAX.landmark} characters.`;

  const city = text(f.city);
  if (!city) errors.city = 'City is required.';
  else if (city.length > MAX.city) errors.city = `City can be at most ${MAX.city} characters.`;

  const state = text(f.state);
  if (!state) errors.state = 'State is required.';
  else if (state.length > MAX.state) errors.state = `State can be at most ${MAX.state} characters.`;

  if (!/^\d{6}$/.test(text(f.pincode))) errors.pincode = 'Enter a valid 6-digit pincode.';

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * One-line postal address. Reads both shapes in circulation: an address-book
 * entry (`line1`/`line2`) and the legacy `profiles.address` object (`street`,
 * which the database trigger already builds as "line1, line2").
 */
export function formatAddressLine(address) {
  if (!address) return '';
  return [address.line1 ?? address.street, address.line2, address.city, address.state, address.pincode]
    .map(text)
    .filter(Boolean)
    .join(', ');
}

/**
 * What the profile screen and the checkout "Deliver to" card show for the
 * customer's DEFAULT address, read from the mirrored `profiles.address` (the one
 * place the app, checkout and invoices all agree on). `null` when there is no
 * street yet — the same test the COD check applies.
 */
export function describeProfileAddress(profileAddress, fallback = {}) {
  const a = profileAddress && typeof profileAddress === 'object' ? profileAddress : null;
  if (!a || !text(a.street)) return null;
  return {
    id: a.addressId || null,
    label: text(a.label),
    name: text(a.fullName) || text(fallback.name),
    phone: formatPhone(a.phone || fallback.phone),
    line: formatAddressLine(a),
    landmark: text(a.landmark),
  };
}

/** camelCase form fields -> `addresses` columns (trimmed, phone as bare digits). */
export function toAddressRow(fields) {
  const f = fields || {};
  return {
    label: text(f.label),
    full_name: text(f.fullName),
    phone: normalizePhone(f.phone),
    line1: text(f.line1),
    line2: text(f.line2),
    landmark: text(f.landmark),
    city: text(f.city),
    state: text(f.state),
    pincode: text(f.pincode),
  };
}

/** `addresses` row -> camelCase address. */
export function fromAddressRow(row) {
  return {
    id: row.id,
    label: row.label || 'Home',
    fullName: row.full_name || '',
    phone: row.phone || '',
    line1: row.line1 || '',
    line2: row.line2 || '',
    landmark: row.landmark || '',
    city: row.city || '',
    state: row.state || '',
    pincode: row.pincode || '',
    country: row.country || 'India',
    isDefault: !!row.is_default,
    createdAt: row.created_at,
  };
}