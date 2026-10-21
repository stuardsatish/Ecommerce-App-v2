// src/utils/returnsMedia.js: the RN-only helpers for the photos and the request id of a return / exchange request.
// expo-crypto is native; the logic project runs in plain Node, so it is replaced by a stand-in.
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-2222-4333-8444-555555555555' }));

const { newRequestId, photoMime, describePickedPhoto, readPickedPhoto } = require('@/utils/returnsMedia');

describe('newRequestId', () => {
  it('is the device uuid (one per request form: the server is idempotent on it)', () => {
    expect(newRequestId()).toBe('11111111-2222-4333-8444-555555555555');
  });
});

describe('photoMime', () => {
  it('trusts the picker, else the file name, else JPEG', () => {
    expect(photoMime({ mimeType: 'image/png', uri: 'file:///a.jpg' })).toBe('image/png');
    expect(photoMime({ mimeType: 'IMAGE/WEBP' })).toBe('image/webp');
    expect(photoMime({ fileName: 'holiday.PNG' })).toBe('image/png');
    expect(photoMime({ uri: 'file:///cache/x/photo.webp?size=1' })).toBe('image/webp');
    expect(photoMime({ uri: 'file:///cache/x/photo' })).toBe('image/jpeg');
    expect(photoMime({ mimeType: 'application/octet-stream', uri: 'file:///a.heic' })).toBe('image/jpeg');
    expect(photoMime(null)).toBe('image/jpeg');
  });
});

describe('describePickedPhoto', () => {
  it('accepts a photo and describes it without its bytes', () => {
    const r = describePickedPhoto({ uri: 'file:///cache/a.jpg', mimeType: 'image/jpeg', fileName: 'a.jpg', fileSize: 1234 });
    expect(r).toEqual({ ok: true, error: '', file: { name: 'a.jpg', type: 'image/jpeg', size: 1234 } });
  });
  it('names a nameless photo after its type and keeps an unknown size at 0 (the bytes are measured when they are read)', () => {
    const r = describePickedPhoto({ uri: 'file:///cache/ImagePicker/1234', mimeType: 'image/png' });
    expect(r.ok).toBe(true);
    expect(r.file).toEqual({ name: 'photo.png', type: 'image/png', size: 0 });
  });
  it('only the last segment of a picker path becomes the name', () => {
    expect(describePickedPhoto({ uri: 'file:///x', fileName: 'C:\\Users\\me\\IMG 1.jpg', mimeType: 'image/jpeg' }).file.name).toBe('IMG 1.jpg');
  });
  it('refuses SVG, GIF and anything over 5 MB with the shared message', () => {
    expect(describePickedPhoto({ uri: 'file:///a.svg', mimeType: 'image/svg+xml' })).toEqual({ ok: false, error: 'SVG files are not allowed.', file: null });
    expect(describePickedPhoto({ uri: 'file:///a.gif', mimeType: 'image/gif' }).ok).toBe(false);
    const big = describePickedPhoto({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 5 * 1024 * 1024 + 1 });
    expect(big.ok).toBe(false);
    expect(big.error).toMatch(/too large/);
    expect(describePickedPhoto(null).ok).toBe(false);
  });
});

describe('readPickedPhoto', () => {
  afterEach(() => {
    delete global.fetch;
  });
  it('reads the bytes and reports their real size', async () => {
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(2048) }));
    const r = await readPickedPhoto({ uri: 'file:///cache/a.jpg', mimeType: 'image/jpeg', fileName: 'a.jpg' });
    expect(global.fetch).toHaveBeenCalledWith('file:///cache/a.jpg');
    expect([r.name, r.type, r.size, r.body.byteLength]).toEqual(['a.jpg', 'image/jpeg', 2048, 2048]);
  });
  it('does not read a photo that was refused', async () => {
    global.fetch = jest.fn();
    await expect(readPickedPhoto({ uri: 'file:///a.svg', mimeType: 'image/svg+xml' })).rejects.toThrow(/SVG/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});