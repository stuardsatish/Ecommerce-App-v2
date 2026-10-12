// Review photos, helpful votes and product Q&A. Backed by
// Ecommerce-website/supabase/migrations/20261008_01_reviews_plus.sql, shared
// with the web app (which has a twin of this module with the same exports).
//
// That SQL is applied by hand, so every call here treats "the backend feature
// isn't there yet" as a normal condition: it warns once per session and hands
// back an empty/null value so the UI just hides the section. Real failures
// (RLS denials, the RPCs' own readable `raise exception` text, network) are
// thrown as `Error(message)` for the caller to toast.
import { supabase } from '@/lib/supabase';
import { validateImageFile } from '@/utils/uploadValidation';

const PHOTO_BUCKET = 'review-photos';
export const MAX_REVIEW_PHOTOS = 4;
export const MAX_REVIEW_PHOTO_BYTES = 3 * 1024 * 1024;
const QA_LIMIT = 50;

// The bucket only accepts these (see the migration), so a content type outside
// this map is never sent.
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TYPE_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);

/** PostgREST's "that function/table doesn't exist (yet)" signals. */
export function isMissingBackend(error) {
  if (!error) return false;
  if (MISSING_CODES.has(error.code)) return true;
  const msg = String(error.message || '');
  return msg.includes('Could not find the function') || msg.includes('schema cache');
}

let warnedMissing = false;
function warnMissingOnce(what, error) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(`[reviewsPlus] ${what} isn't available on the backend yet; hiding it.`, error?.message || '');
}

// supabase-js hands back PostgrestError / StorageError objects; callers only
// want something with a readable `.message`.
const toError = (error, fallback) => new Error(error?.message || fallback);

/** Public URL of a stored review photo (the bucket is public). */
export function reviewPhotoUrl(path) {
  if (!path) return '';
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Order / product ids are free-form text; keep the object key to characters
// storage is certain to accept.
const safeSegment = (value) => String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '_');

function contentTypeOf(asset) {
  const type = (asset.mimeType || '').toLowerCase();
  if (EXT_BY_TYPE[type]) return type;
  const ext = ((asset.fileName || asset.uri || '').split('?')[0].split('.').pop() || '').toLowerCase();
  return TYPE_BY_EXT[ext] || 'image/jpeg';
}

// Same approach as the avatar upload in the profile screen: supabase-js needs
// bytes, and a picked asset only gives us a URI (`file://` on device, a
// `blob:`/`data:` URI on Expo web) — both are fetch()able.
async function readAsArrayBuffer(uri) {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

/** Best-effort removal of stored photos; never throws (it's only tidying up). */
export async function removeReviewPhotoFiles(paths) {
  if (!paths?.length) return;
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  } catch (err) {
    console.warn('[reviewsPlus] could not remove review photos', err?.message || err);
  }
}

/**
 * Upload picked images into `<userId>/<orderId>_<productId>/` of the
 * `review-photos` bucket. All-or-nothing: files are validated up front and,
 * if one upload fails part-way, the ones already stored are removed again.
 * @param {{ userId:string, orderId:string, productId:string, files:Array<{uri:string,mimeType?:string,fileName?:string,fileSize?:number}> }} args
 * @returns {Promise<string[]>} storage object paths
 */
export async function uploadReviewPhotos({ userId, orderId, productId, files }) {
  const list = (files || []).slice(0, MAX_REVIEW_PHOTOS);
  if (!list.length) return [];
  if (!userId) throw new Error('Please sign in to upload photos.');

  for (const asset of list) {
    const check = validateImageFile(asset, { maxBytes: MAX_REVIEW_PHOTO_BYTES, allowGif: false });
    if (!check.ok) throw new Error(check.error);
  }

  const folder = `${userId}/${safeSegment(orderId)}_${safeSegment(productId)}`;
  const stamp = Date.now();
  const uploaded = [];
  try {
    for (let i = 0; i < list.length; i += 1) {
      const asset = list[i];
      const contentType = contentTypeOf(asset);
      const path = `${folder}/${stamp}_${i}.${EXT_BY_TYPE[contentType]}`;
      const body = await readAsArrayBuffer(asset.uri);
      // The picker doesn't always report a size, so measure the real bytes too.
      if (body.byteLength > MAX_REVIEW_PHOTO_BYTES) throw new Error('File is too large (max 3 MB).');
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, { contentType, upsert: false });
      if (error) throw toError(error, 'Photo upload failed.');
      uploaded.push(path);
    }
  } catch (err) {
    await removeReviewPhotoFiles(uploaded);
    throw err;
  }
  return uploaded;
}

/** Replace the photos on the caller's own review (an empty array clears them). */
export async function setReviewPhotos(reviewId, paths) {
  const { error } = await supabase.rpc('set_review_photos', {
    p_review_id: String(reviewId),
    p_photos: paths || [],
  });
  if (error) {
    if (isMissingBackend(error)) warnMissingOnce('Review photos', error);
    throw toError(error, 'Could not attach photos to your review.');
  }
}

/**
 * Helpful / not-helpful tallies for every review of a product.
 * @returns {Promise<Record<string,{helpfulCount:number,unhelpfulCount:number,myVote:number}>|null>}
 *   keyed by review id; `null` when the backend feature doesn't exist yet.
 */
export async function fetchReviewVotes(productId) {
  const { data, error } = await supabase.rpc('review_vote_summary', { p_product_id: String(productId) });
  if (error) {
    if (isMissingBackend(error)) {
      warnMissingOnce('Review voting', error);
      return null;
    }
    throw toError(error, 'Could not load review votes.');
  }
  const votes = {};
  (data || []).forEach((row) => {
    votes[row.review_id] = {
      helpfulCount: Number(row.helpful_count) || 0,
      unhelpfulCount: Number(row.unhelpful_count) || 0,
      myVote: Number(row.my_vote) || 0,
    };
  });
  return votes;
}

/**
 * Cast (1), flip (-1) or clear (0) the caller's vote. Resolves to the
 * authoritative tallies; rejects with the server's own message when refused
 * (own review, signed out, guest …).
 */
export async function voteOnReview(reviewId, vote) {
  const { data, error } = await supabase.rpc('vote_on_review', {
    p_review_id: String(reviewId),
    p_vote: vote,
  });
  if (error) {
    if (isMissingBackend(error)) warnMissingOnce('Review voting', error);
    throw toError(error, 'Could not record your vote.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    helpfulCount: Number(row?.helpful_count) || 0,
    unhelpfulCount: Number(row?.unhelpful_count) || 0,
    myVote: Number(row?.my_vote) || 0,
  };
}

const NO_PERMISSIONS = { canAsk: false, canAnswer: false, isStaff: false };

const mapAnswer = (a) => ({
  id: a.id,
  answer: a.answer,
  createdAt: a.created_at,
  answerer: a.answerer || 'Customer',
  isStaff: !!a.is_staff,
  isMine: !!a.is_mine,
});

const mapQuestion = (q) => ({
  id: q.id,
  question: q.question,
  createdAt: q.created_at,
  asker: q.asker || 'Customer',
  isMine: !!q.is_mine,
  answers: Array.isArray(q.answers) ? q.answers.map(mapAnswer) : [],
});

/**
 * A product's questions with their answers, plus what the current visitor may
 * do. `available: false` means the Q&A backend isn't there yet.
 * @returns {Promise<{ available:boolean, permissions:{canAsk:boolean,canAnswer:boolean,isStaff:boolean}, questions:Array }>}
 */
export async function fetchProductQA(productId) {
  const id = String(productId);
  const [perms, list] = await Promise.all([
    supabase.rpc('product_qa_permissions', { p_product_id: id }),
    supabase.rpc('list_product_qa', { p_product_id: id, p_limit: QA_LIMIT }),
  ]);
  const failed = perms.error || list.error;
  if (failed) {
    if (isMissingBackend(perms.error) || isMissingBackend(list.error)) {
      warnMissingOnce('Product Q&A', failed);
      return { available: false, permissions: NO_PERMISSIONS, questions: [] };
    }
    throw toError(failed, 'Could not load questions.');
  }
  const p = perms.data || {};
  return {
    available: true,
    permissions: { canAsk: !!p.can_ask, canAnswer: !!p.can_answer, isStaff: !!p.is_staff },
    questions: Array.isArray(list.data) ? list.data.map(mapQuestion) : [],
  };
}

export async function askQuestion(productId, question) {
  const { data, error } = await supabase.rpc('ask_product_question', {
    p_product_id: String(productId),
    p_question: question,
  });
  if (error) throw toError(error, 'Could not post your question.');
  return data;
}

export async function answerQuestion(questionId, answer) {
  const { data, error } = await supabase.rpc('answer_product_question', {
    p_question_id: questionId,
    p_answer: answer,
  });
  if (error) throw toError(error, 'Could not post your answer.');
  return data;
}

// RLS lets a user delete their own rows (and admins anyone's) but a refused
// DELETE isn't an error — it just matches zero rows. Asking for the deleted
// ids back is what tells the two apart.
async function deleteRow(table, id, what) {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) throw toError(error, `Could not delete the ${what}.`);
  if (!data?.length) throw new Error(`Could not delete the ${what}. It may already be gone.`);
}

export const deleteQuestion = (questionId) => deleteRow('product_questions', questionId, 'question');
export const deleteAnswer = (answerId) => deleteRow('product_answers', answerId, 'answer');