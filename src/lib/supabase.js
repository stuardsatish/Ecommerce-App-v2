import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env ' +
      'and fill in the project values — unlike the source web app, this client does not fall back ' +
      'to a hardcoded default (see MIGRATION_ANALYSIS.md §7, security note 1).'
  );
}

// detectSessionInUrl is web-only (URL fragment parsing) — disabled here; the
// password-reset deep link is handled explicitly instead (see Phase 5 /
// Unclear Item 10 in MIGRATION_ANALYSIS.md).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});