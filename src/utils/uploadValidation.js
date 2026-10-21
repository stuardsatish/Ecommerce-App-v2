// Ported from Ecommerce-sept-1-2026/src/utils/uploadValidation.js — same
// rules (block SVG, restrict to raster types, enforce a max size), adapted
// to the `expo-image-picker` asset shape ({ uri, mimeType, fileName,
// fileSize }) instead of a web `File` ({ type, name, size }). SVG blocking
// is largely moot on RN (the picker only surfaces photo-library images,
// there's no way to select an arbitrary SVG file the way a web `<input
// type="file">` could), but the check is kept for defence in depth in case
// a future picker source (e.g. a document picker) is ever added.

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

// The extension of the LEAF only: a name without a dot ('file:///cache/ImagePicker/1234', 'blob:http://host/uuid') has none, and a dot in a
// folder or host name ('/data/user/0/com.app.id/cache/1234') is not one. (It used to take everything after the last dot of the whole string,
// which turned those URIs into a bogus "extension" and refused a perfectly good image.) With no extension the mime type decides.
const extOf = (asset) => {
  const name = String(asset.fileName || asset.uri || '').split('?')[0];
  const leaf = name.split('/').pop() || '';
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(dot + 1).toLowerCase() : '';
};

/**
 * @param {{uri: string, mimeType?: string, fileName?: string, fileSize?: number}} asset
 * @param {{ maxBytes?: number, allowGif?: boolean }} [opts]
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateImageFile(asset, opts = {}) {
  const { maxBytes = 5 * 1024 * 1024, allowGif = true } = opts;
  if (!asset) return { ok: false, error: 'No image selected.' };

  const type = (asset.mimeType || '').toLowerCase();
  const ext = extOf(asset);

  if (type === 'image/svg+xml' || ext === 'svg') {
    return { ok: false, error: 'SVG files are not allowed.' };
  }

  const allowedTypes = allowGif ? ALLOWED_TYPES : ALLOWED_TYPES.filter((t) => t !== 'image/gif');
  const allowedExts = allowGif ? ALLOWED_EXTENSIONS : ALLOWED_EXTENSIONS.filter((e) => e !== 'gif');

  // The picker doesn't always report mimeType; fall back to the extension
  // alone in that case rather than rejecting a valid image outright.
  const typeOk = type ? allowedTypes.includes(type) : true;
  const extOk = ext ? allowedExts.includes(ext) : true;
  if (!typeOk || !extOk) {
    return { ok: false, error: 'Only PNG, JPG, WEBP or GIF images are allowed.' };
  }
  // fileSize isn't always reported by the picker (platform-dependent) — skip
  // the size check rather than reject an image we can't measure.
  if (asset.fileSize && asset.fileSize > maxBytes) {
    return { ok: false, error: `File is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).` };
  }
  return { ok: true };
}