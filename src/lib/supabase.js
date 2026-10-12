import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hexosjsftzdqmwqbeahy.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhleG9zanNmdHpkcW13cWJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjkwNjUsImV4cCI6MjEwMTY0NTA2NX0.snKMNLSxXbq8zUkFaZlkrDYz0TsvF6_DY-OsGFmSuvI';

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