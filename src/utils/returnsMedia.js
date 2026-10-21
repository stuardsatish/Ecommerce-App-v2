// RN-only helpers for the photos and the request id of a return / exchange request (the website does the same with a File and crypto.randomUUID()).
// Kept apart from services/returns.js on purpose: that file is the twin of the website's service and is run against the website's tests, so it
// must not import native modules. Pure parts (photoMime, describePickedPhoto) are unit tested; newRequestId / readPickedPhoto touch the device.
import * as Crypto from 'expo-crypto';

import { EVIDENCE_MAX_BYTES } from '@/utils/requestModel';
import { validateImageFile } from '@/utils/uploadValidation';

const TYPE_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** One id per request form: a retry (double tap, lost connection) can never create a second request - the database is idempotent on it. */
export const newRequestId = () => Crypto.randomUUID();

/** The content type of a picked asset: what the picker reported, else guessed from the file name, else JPEG (the picker re-encodes to JPEG by default). */
export function photoMime(asset) {
  const type = String((asset && asset.mimeType) || '').toLowerCase();
  if (EXT_BY_TYPE[type]) return type;
  const name = String((asset && (asset.fileName || asset.uri)) || '').split('?')[0];
  const ext = (name.split('.').pop() || '').toLowerCase();
  return TYPE_BY_EXT[ext] || 'image/jpeg';
}

/** Checks a picked asset BEFORE it is read (type and, when the picker told us, size). { ok, error, file } - file = { name, type, size } without the bytes. */
export function describePickedPhoto(asset) {
  const check = validateImageFile(asset, { maxBytes: EVIDENCE_MAX_BYTES, allowGif: false });
  if (!check.ok) return { ok: false, error: check.error, file: null };
  const type = photoMime(asset);
  const leaf = String((asset && asset.fileName) || '').split(/[\\/]/).pop();
  return { ok: true, error: '', file: { name: leaf || `photo.${EXT_BY_TYPE[type]}`, type, size: Number(asset && asset.fileSize) || 0 } };
}

/** Reads the bytes of a picked photo (a `file://` URI on a device, a `blob:` / `data:` URI on Expo web - all fetch()able) into the shape uploadEvidence() takes. */
export async function readPickedPhoto(asset) {
  const meta = describePickedPhoto(asset);
  if (!meta.ok) throw new Error(meta.error);
  const response = await fetch(asset.uri);
  const body = await response.arrayBuffer();
  return { ...meta.file, size: body.byteLength, body };
}