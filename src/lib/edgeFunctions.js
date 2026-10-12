// Ported from Ecommerce-sept-1-2026/src/utils/edgeFunctions.js — same contract,
// same Edge Functions, same bearer-token auth. Only the Supabase client import
// path changed.
import { supabase } from '@/lib/supabase';

export const FUNCTIONS_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hexosjsftzdqmwqbeahy.supabase.co'}/functions/v1`;

/** JSON headers + the current Supabase session's access token, if any. */
export async function functionAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* sent without token → the function 401s */
  }
  return headers;
}

/**
 * POSTs JSON to an Edge Function with the caller's Supabase session attached.
 * @param {string} name Edge Function name, e.g. "payment-create-order"
 * @param {object} body
 */
export async function callFunction(name, body) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: await functionAuthHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}