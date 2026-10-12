/**
 * Address book rules (roadmap task 4.2): what counts as a valid address, how
 * phone numbers are normalised, and how an address reads as one line. The
 * database only enforces column lengths, so these are the real gatekeepers -
 * and they are shared word-for-word with the web app's twin module.
 */
const {
  ADDRESS_LIMIT,
  EMPTY_ADDRESS,
  describeProfileAddress,
  formatAddressLine,
  formatPhone,
  fromAddressRow,
  normalizePhone,
  toAddressRow,
  validateAddress,
} = require('@/utils/addressBook');

const valid = (over = {}) => ({
  label: 'Home',
  fullName: 'Asha Kumar',
  phone: '98765 43210',
  line1: '12 MG Road',
  line2: 'Flat 4B',
  landmark: 'Near Metro',
  city: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '600001',
  ...over,
});

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['98765-43210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
    ['(+91) 9876543210', '9876543210'],
    ['919876543210', '9876543210'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('does not mistake a 10-digit number that starts with 91 for a country code', () => {
    expect(normalizePhone('9123456789')).toBe('9123456789');
  });

  it('leaves wrong-length input as bare digits for validation to reject', () => {
    expect(normalizePhone('12345')).toBe('12345');
    expect(normalizePhone('+91 98765 432101')).toBe('919876543210' + '1');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });
});

describe('formatPhone', () => {
  it('shows a 10-digit number as +91 XXXXX XXXXX', () => {
    expect(formatPhone('9876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+91 98765-43210')).toBe('+91 98765 43210');
  });

  it('shows anything else as stored, and empty as empty', () => {
    expect(formatPhone('12345')).toBe('12345');
    expect(formatPhone('')).toBe('');
    expect(formatPhone(undefined)).toBe('');
  });
});

describe('validateAddress', () => {
  it('accepts a complete address, with or without the optional lines', () => {
    expect(validateAddress(valid())).toEqual({ ok: true, errors: {} });
    expect(validateAddress(valid({ line2: '', landmark: '' })).ok).toBe(true);
  });

  it('reports every missing required field at once, keyed by field name', () => {
    const { ok, errors } = validateAddress({ ...EMPTY_ADDRESS });
    expect(ok).toBe(false);
    expect(Object.keys(errors).sort()).toEqual(['city', 'fullName', 'line1', 'phone', 'pincode', 'state']);
    expect(errors.pincode).toBe('Enter a valid 6-digit pincode.');
  });

  it('treats a missing fields object as an empty address', () => {
    expect(validateAddress(undefined).ok).toBe(false);
    expect(validateAddress(null).ok).toBe(false);
  });

  it('needs a name of at least 2 characters (after trimming)', () => {
    expect(validateAddress(valid({ fullName: 'A' })).errors.fullName).toBeTruthy();
    expect(validateAddress(valid({ fullName: '  A  ' })).errors.fullName).toBeTruthy();
    expect(validateAddress(valid({ fullName: 'Al' })).errors.fullName).toBeUndefined();
  });

  it('accepts phone numbers however they are typed, once they reduce to 10 digits', () => {
    expect(validateAddress(valid({ phone: '+91 98765 43210' })).errors.phone).toBeUndefined();
    expect(validateAddress(valid({ phone: '98765-43210' })).errors.phone).toBeUndefined();
    expect(validateAddress(valid({ phone: '9876543' })).errors.phone).toBeTruthy();
    expect(validateAddress(valid({ phone: '98765432101' })).errors.phone).toBeTruthy();
    expect(validateAddress(valid({ phone: 'abcdefghij' })).errors.phone).toBeTruthy();
  });

  it('needs line 1 of at least 3 characters', () => {
    expect(validateAddress(valid({ line1: 'ab' })).errors.line1).toBeTruthy();
    expect(validateAddress(valid({ line1: '   ' })).errors.line1).toBeTruthy();
    expect(validateAddress(valid({ line1: '12 ' })).errors.line1).toBeUndefined();
  });

  it('needs city and state, ignoring whitespace-only values', () => {
    expect(validateAddress(valid({ city: '   ' })).errors.city).toBe('City is required.');
    expect(validateAddress(valid({ state: '' })).errors.state).toBe('State is required.');
  });

  it('needs a pincode of exactly 6 digits', () => {
    expect(validateAddress(valid({ pincode: '60001' })).errors.pincode).toBeTruthy();
    expect(validateAddress(valid({ pincode: '6000011' })).errors.pincode).toBeTruthy();
    expect(validateAddress(valid({ pincode: '60000A' })).errors.pincode).toBeTruthy();
    expect(validateAddress(valid({ pincode: ' 600001 ' })).errors.pincode).toBeUndefined();
  });

  it('keeps the label between 1 and 30 characters', () => {
    expect(validateAddress(valid({ label: '' })).errors.label).toBeTruthy();
    expect(validateAddress(valid({ label: '   ' })).errors.label).toBeTruthy();
    expect(validateAddress(valid({ label: 'x'.repeat(30) })).errors.label).toBeUndefined();
    expect(validateAddress(valid({ label: 'x'.repeat(31) })).errors.label).toBeTruthy();
  });

  it("refuses values longer than the database's column limits", () => {
    const { errors } = validateAddress(
      valid({
        fullName: 'n'.repeat(101),
        line1: 'a'.repeat(201),
        line2: 'b'.repeat(201),
        landmark: 'c'.repeat(101),
        city: 'd'.repeat(81),
        state: 'e'.repeat(81),
      })
    );
    expect(Object.keys(errors).sort()).toEqual(['city', 'fullName', 'landmark', 'line1', 'line2', 'state']);
  });
});

describe('formatAddressLine', () => {
  it('joins an address-book entry in postal order, skipping blanks', () => {
    expect(formatAddressLine(valid())).toBe('12 MG Road, Flat 4B, Chennai, Tamil Nadu, 600001');
    expect(formatAddressLine(valid({ line2: '' }))).toBe('12 MG Road, Chennai, Tamil Nadu, 600001');
  });

  it('reads the legacy profiles.address shape (street already holds line1 + line2)', () => {
    expect(
      formatAddressLine({ street: '12 MG Road, Flat 4B', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' })
    ).toBe('12 MG Road, Flat 4B, Chennai, Tamil Nadu, 600001');
  });

  it('trims parts and tolerates nothing at all', () => {
    expect(formatAddressLine({ line1: ' 1 A St ', city: ' X ' })).toBe('1 A St, X');
    expect(formatAddressLine(null)).toBe('');
    expect(formatAddressLine(undefined)).toBe('');
    expect(formatAddressLine({})).toBe('');
  });
});

describe('describeProfileAddress', () => {
  const mirrored = {
    street: '12 MG Road, Flat 4B',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    landmark: 'Near Metro',
    label: 'Home',
    fullName: 'Asha Kumar',
    phone: '9876543210',
    addressId: 'a1',
  };

  it('describes the mirrored default address', () => {
    expect(describeProfileAddress(mirrored)).toEqual({
      id: 'a1',
      label: 'Home',
      name: 'Asha Kumar',
      phone: '+91 98765 43210',
      line: '12 MG Road, Flat 4B, Chennai, Tamil Nadu, 600001',
      landmark: 'Near Metro',
    });
  });

  it("falls back to the account's name and phone for an address that carries neither", () => {
    const d = describeProfileAddress(
      { street: '1 A St', city: 'X', state: 'Y', pincode: '111111' },
      { name: 'Asha', phone: '9876543210' }
    );
    expect(d).toMatchObject({ name: 'Asha', phone: '+91 98765 43210', label: '', id: null });
  });

  it('is null for an address with no street - the same test COD applies', () => {
    expect(describeProfileAddress({ street: '', city: '', state: '', pincode: '' })).toBeNull();
    expect(describeProfileAddress({ street: '   ', city: 'X' })).toBeNull();
    expect(describeProfileAddress(null)).toBeNull();
    expect(describeProfileAddress('12 Some Street')).toBeNull();
  });
});

describe('row mapping', () => {
  it('maps form fields to columns: trimmed, phone as 10 bare digits', () => {
    expect(
      toAddressRow(valid({ label: ' Home ', fullName: ' Asha ', phone: '+91 98765 43210', line1: ' 12 MG Road ' }))
    ).toEqual({
      label: 'Home',
      full_name: 'Asha',
      phone: '9876543210',
      line1: '12 MG Road',
      line2: 'Flat 4B',
      landmark: 'Near Metro',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
    });
  });

  it('never emits null for a text column - the table has NOT NULL with empty defaults', () => {
    const row = toAddressRow({ label: 'Home', line1: 'x' });
    Object.values(row).forEach((v) => expect(typeof v).toBe('string'));
  });

  it('maps columns back to camelCase', () => {
    expect(
      fromAddressRow({
        id: 'a1',
        user_id: 'u1',
        label: 'Work',
        full_name: 'Asha',
        phone: '9876543210',
        line1: '1 A St',
        line2: '',
        landmark: '',
        city: 'X',
        state: 'Y',
        pincode: '111111',
        country: 'India',
        is_default: true,
        created_at: '2026-10-07T00:00:00Z',
      })
    ).toEqual({
      id: 'a1',
      label: 'Work',
      fullName: 'Asha',
      phone: '9876543210',
      line1: '1 A St',
      line2: '',
      landmark: '',
      city: 'X',
      state: 'Y',
      pincode: '111111',
      country: 'India',
      isDefault: true,
      createdAt: '2026-10-07T00:00:00Z',
    });
  });
});

it('keeps the limit in step with the database trigger', () => {
  expect(ADDRESS_LIMIT).toBe(10);
});