// Address book: several labelled delivery addresses per customer, one of them
// the default. Backed by Ecommerce-website/supabase/migrations/
// 20261008_02_address_book.sql, shared with the web app (which has a twin of
// this module with the same exports).
//
// The database does the bookkeeping (10-address cap, first address = default,
// one default at a time, promotion when the default is deleted, mirroring the
// default into `profiles.address`), so this module only maps fields and
// reports the server's own readable messages. The one thing it adds is keeping
// the Redux copy of the profile in step: the cart's COD check, the profile
// screen and the checkout card all read `user.address` from the store.
//
// That SQL is applied by hand, so reading treats "the backend feature isn't
// there yet" as a normal condition (warn once, return nothing); writes throw a
// readable message instead.
import { supabase } from '@/lib/supabase';
import { isMissingBackend } from '@/services/reviewsPlus';
import { store } from '@/store';
import { setUser } from '@/store/UserSlice';
import {
  fromAddressRow,
  toAddressRow,
  validateAddress,
} from '@/utils/addressBook';

export {
  ADDRESS_LIMIT,
  EMPTY_ADDRESS,
  LABEL_PRESETS,
  describeProfileAddress,
  formatAddressLine,
  formatPhone,
  normalizePhone,
  validateAddress,
} from '@/utils/addressBook';

// The shape `profiles.address` has for a customer without an address (what
// signup writes), so nothing that reads it needs a new case.
const NO_PROFILE_ADDRESS = { street: '', city: '', state: '', pincode: '' };

let warnedMissing = false;
function warnMissingOnce(error) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn("[addresses] The address book isn't available on the backend yet; hiding it.", error?.message || '');
}

const UNAVAILABLE = "Saved addresses aren't available right now. Please try again later.";

// supabase-js hands back PostgrestError objects; callers only want a `.message`.
function toError(error, fallback) {
  if (isMissingBackend(error)) {
    warnMissingOnce(error);
    return new Error(UNAVAILABLE);
  }
  return new Error(error?.message || fallback);
}

/**
 * Re-read `profiles.address` (the trigger-maintained mirror of the default
 * address) into Redux. Never throws: by the time this runs the write itself
 * has succeeded, and a failed refresh must not make that look like a failure.
 */
export async function refreshProfileAddress() {
  const current = store.getState().user.user;
  if (!current?.uid) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('address')
      .eq('id', current.uid)
      .maybeSingle();
    if (error || !data) throw error || new Error('profile not found');
    // Re-read the store: the user may have changed while the request was out.
    const latest = store.getState().user.user;
    if (latest?.uid === current.uid) store.dispatch(setUser({ ...latest, address: data.address }));
  } catch (err) {
    console.warn('[addresses] could not refresh the profile address', err?.message || err);
  }
}

/** The signed-in user's saved addresses, default first and then newest first. */
export async function listAddresses() {
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingBackend(error)) {
      warnMissingOnce(error);
      return [];
    }
    throw toError(error, 'Could not load your addresses.');
  }
  return (data || []).map(fromAddressRow);
}

// The form validates before submitting, but the service is the last stop before
// the database (which only checks lengths), so it refuses bad input itself.
function assertValid(fields) {
  const { ok, errors } = validateAddress(fields);
  if (!ok) throw new Error(Object.values(errors)[0]);
}

/**
 * Save a new address. The first one a customer saves becomes the default no
 * matter what `isDefault` says; `isDefault: true` makes this one the default.
 */
export async function createAddress(fields) {
  assertValid(fields);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Please sign in to save an address.');

  const { data, error } = await supabase
    .from('addresses')
    .insert({ ...toAddressRow(fields), user_id: session.user.id, is_default: !!fields.isDefault })
    .select()
    .single();
  if (error) throw toError(error, 'Could not save the address.');
  const saved = fromAddressRow(data);
  if (saved.isDefault) await refreshProfileAddress();
  return saved;
}

/**
 * Edit an address. `isDefault: true` promotes it; a falsy value is deliberately
 * NOT sent, because un-defaulting the current default would leave the customer
 * with no default at all (the way to change the default is to set another).
 */
export async function updateAddress(id, fields) {
  assertValid(fields);
  const row = toAddressRow(fields);
  if (fields.isDefault === true) row.is_default = true;

  const { data, error } = await supabase.from('addresses').update(row).eq('id', id).select().maybeSingle();
  if (error) throw toError(error, 'Could not update the address.');
  // RLS hides rows that aren't the caller's, and a refused UPDATE isn't an
  // error — it just matches nothing.
  if (!data) throw new Error('Could not update the address. It may have been removed.');
  const saved = fromAddressRow(data);
  if (saved.isDefault) await refreshProfileAddress();
  return saved;
}

/**
 * Delete an address. When it was the default the database promotes the newest
 * remaining one. When it was the LAST address nothing is left to promote and
 * the trigger leaves the old mirror in `profiles.address`, which would keep
 * checkout shipping to an address the customer just removed — so it is blanked.
 */
export async function deleteAddress(id) {
  const { data, error } = await supabase.from('addresses').delete().eq('id', id).select('id');
  if (error) throw toError(error, 'Could not delete the address.');
  if (!data?.length) throw new Error('Could not delete the address. It may already be gone.');

  const { data: remaining } = await supabase.from('addresses').select('id').limit(1);
  const uid = store.getState().user.user?.uid;
  if (uid && Array.isArray(remaining) && remaining.length === 0) {
    const { error: clearError } = await supabase.from('profiles').update({ address: NO_PROFILE_ADDRESS }).eq('id', uid);
    if (clearError) console.warn('[addresses] could not clear the profile address', clearError.message);
  }
  await refreshProfileAddress();
}

/** Make an address the default (the database un-defaults the previous one). */
export async function setDefaultAddress(id) {
  const { data, error } = await supabase
    .from('addresses')
    .update({ is_default: true })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw toError(error, 'Could not change your default address.');
  if (!data) throw new Error('Could not change your default address. It may have been removed.');
  await refreshProfileAddress();
  return fromAddressRow(data);
}