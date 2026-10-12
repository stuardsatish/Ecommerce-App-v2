/**
 * `src/lib/supabase.js` throws at import time when the two EXPO_PUBLIC_*
 * variables are missing — a deliberate guard (see MIGRATION_ANALYSIS.md §7,
 * security note 1: this client refuses to fall back to hardcoded defaults the
 * way the source web app did). Any module that transitively imports it would
 * therefore fail to load under test.
 *
 * These are obviously-fake values pointing at a non-routable host. Nothing in
 * the suite performs real network I/O: tests either exercise pure functions or
 * mock `@/lib/supabase` outright. A test that accidentally issues a live
 * request fails on DNS rather than silently talking to a real project.
 */
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:1/supabase-test-stub';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-not-a-real-credential';