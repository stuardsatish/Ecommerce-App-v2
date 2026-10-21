/**
 * Input validation: credential rules and upload gating.
 *
 * Note the deliberate asymmetry these tests lock in — signup requires a
 * letter AND a digit, while change-password requires only length. That is not
 * an oversight in the port: the source web app's SignupPage and MyProfile use
 * different rules, and the migration preserved the difference rather than
 * silently unifying it. The test records it so a future "cleanup" is a
 * conscious decision rather than an accident.
 */
const {
  isValidEmail,
  isValidSignupPassword,
  isValidNewPassword,
  passwordsMatch,
} = require('@/utils/validators');
const { validateImageFile } = require('@/utils/uploadValidation');

describe('isValidEmail', () => {
  it.each([
    'a@b.co',
    'first.last@example.com',
    'user+tag@sub.domain.co.in',
    'UPPER@EXAMPLE.COM',
  ])('accepts %s', (e) => expect(isValidEmail(e)).toBe(true));

  it.each([
    '',
    'plain',
    'no@domain',
    '@example.com',
    'a b@example.com',
    'a@ex ample.com',
    'two@@example.com',
  ])('rejects %p', (e) => expect(isValidEmail(e)).toBe(false));

  it('does not throw on null/undefined', () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe('isValidSignupPassword — 8+ chars, >=1 letter and >=1 digit', () => {
  it.each(['abcd1234', 'Passw0rd', 'a1234567', '!!aa11!!'])('accepts %s', (p) =>
    expect(isValidSignupPassword(p)).toBe(true)
  );

  it.each([
    ['too short', 'abc1'],
    ['letters only', 'abcdefgh'],
    ['digits only', '12345678'],
    ['symbols only', '!!!!!!!!'],
    ['empty', ''],
    ['7 chars', 'abcd123'],
  ])('rejects %s', (_label, p) => expect(isValidSignupPassword(p)).toBe(false));

  it('does not throw on null', () => {
    expect(isValidSignupPassword(null)).toBe(false);
  });
});

describe('isValidNewPassword — length only, by design', () => {
  it('accepts 8+ characters regardless of composition', () => {
    expect(isValidNewPassword('abcdefgh')).toBe(true);
    expect(isValidNewPassword('12345678')).toBe(true);
  });

  it('rejects shorter than 8', () => {
    expect(isValidNewPassword('abcdefg')).toBe(false);
    expect(isValidNewPassword('')).toBe(false);
    expect(isValidNewPassword(null)).toBe(false);
  });

  it('is intentionally weaker than the signup rule', () => {
    expect(isValidSignupPassword('abcdefgh')).toBe(false);
    expect(isValidNewPassword('abcdefgh')).toBe(true);
  });
});

describe('passwordsMatch', () => {
  it('compares exactly, including case and whitespace', () => {
    expect(passwordsMatch('abc', 'abc')).toBe(true);
    expect(passwordsMatch('abc', 'ABC')).toBe(false);
    expect(passwordsMatch('abc', 'abc ')).toBe(false);
    expect(passwordsMatch('', '')).toBe(true);
  });
});

describe('validateImageFile', () => {
  const asset = (over = {}) => ({ uri: 'file:///p/a.jpg', mimeType: 'image/jpeg', ...over });

  it('rejects a missing asset', () => {
    expect(validateImageFile(null)).toEqual({ ok: false, error: 'No image selected.' });
  });

  it('accepts the allowed raster types', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[t];
      expect(validateImageFile(asset({ mimeType: t, uri: `file:///p/a.${ext}` })).ok).toBe(true);
    }
  });

  it('blocks SVG by mime type and by extension', () => {
    expect(validateImageFile(asset({ mimeType: 'image/svg+xml' }))).toEqual({
      ok: false,
      error: 'SVG files are not allowed.',
    });
    expect(validateImageFile(asset({ mimeType: '', uri: 'file:///p/a.svg' }))).toEqual({
      ok: false,
      error: 'SVG files are not allowed.',
    });
  });

  it('blocks non-image types', () => {
    expect(validateImageFile(asset({ mimeType: 'application/pdf', uri: 'file:///p/a.pdf' })).ok).toBe(false);
    expect(validateImageFile(asset({ mimeType: 'text/html', uri: 'file:///p/a.html' })).ok).toBe(false);
  });

  it('honours allowGif:false', () => {
    const gif = asset({ mimeType: 'image/gif', uri: 'file:///p/a.gif' });
    expect(validateImageFile(gif, { allowGif: true }).ok).toBe(true);
    expect(validateImageFile(gif, { allowGif: false }).ok).toBe(false);
  });

  it('enforces maxBytes when the picker reports a size', () => {
    expect(validateImageFile(asset({ fileSize: 3 * 1024 * 1024 }), { maxBytes: 2 * 1024 * 1024 }).ok).toBe(false);
    expect(validateImageFile(asset({ fileSize: 1 * 1024 * 1024 }), { maxBytes: 2 * 1024 * 1024 }).ok).toBe(true);
  });

  it('skips the size check when the picker reports no size', () => {
    // Platform-dependent: rejecting an unmeasurable image would block valid
    // uploads on the platforms that omit fileSize.
    expect(validateImageFile(asset({ fileSize: undefined }), { maxBytes: 1 }).ok).toBe(true);
  });

  it('ignores a query string when reading the extension', () => {
    expect(validateImageFile(asset({ mimeType: '', uri: 'https://cdn.example/a.png?v=2' })).ok).toBe(true);
  });

  it('falls back to the extension when mimeType is absent', () => {
    expect(validateImageFile({ uri: 'file:///p/a.png' }).ok).toBe(true);
    expect(validateImageFile({ uri: 'file:///p/a.exe' }).ok).toBe(false);
  });

  it('reads the extension of the LEAF only: a URI without one is judged by its mime type, and a dot in a folder is not an extension', () => {
    // a picker URI with no extension (a blob: URL on Expo web, an extension-less cache copy)
    expect(validateImageFile({ uri: 'file:///cache/ImagePicker/1234', mimeType: 'image/png' }).ok).toBe(true);
    expect(validateImageFile({ uri: 'blob:http://localhost:8081/0b1f-uuid', mimeType: 'image/jpeg' }).ok).toBe(true);
    // the Android package name contains dots
    expect(validateImageFile({ uri: 'file:///data/user/0/com.ecommerceapp.mobile/cache/1234', mimeType: 'image/webp' }).ok).toBe(true);
    // ... but the mime type still has the last word
    expect(validateImageFile({ uri: 'file:///cache/ImagePicker/1234', mimeType: 'application/pdf' }).ok).toBe(false);
    expect(validateImageFile({ uri: 'file:///cache/ImagePicker/1234', mimeType: 'image/svg+xml' }).error).toBe('SVG files are not allowed.');
    // a real extension still counts, and so does a double extension's LAST part
    expect(validateImageFile({ uri: 'file:///p/photo.jpeg.exe' }).ok).toBe(false);
    expect(validateImageFile({ fileName: 'IMG 1.PNG', uri: 'file:///cache/x' }).ok).toBe(true);
  });
});