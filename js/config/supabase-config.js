/**
 * Supabase configuration with startup validation.
 * These values are safe to expose — RLS protects data server-side.
 *
 * IMPORTANT: Replace these with your actual Supabase project values.
 */

const SUPABASE_URL = '';  // e.g. 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = '';  // e.g. 'eyJhbGciOiJIUzI1...'

// Sync constants
const SYNC_DEBOUNCE_MS = 30000;
const DAILY_STATS_SYNC_DAYS = 365;
const MAX_FRIENDS = 50;
const LEADERBOARD_LIMIT = 50;

/**
 * Validates Supabase config at startup.
 * @returns {{ ok: true, client: object } | { ok: false, reason: string }}
 */
function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.warn('[SupabaseConfig] SDK not loaded (CDN may be unavailable). Auth features disabled.');
    return { ok: false, reason: 'SDK not loaded' };
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[SupabaseConfig] URL or anon key not configured. Auth features disabled.');
    return { ok: false, reason: 'Not configured' };
  }

  if (!SUPABASE_URL.startsWith('https://') || !SUPABASE_URL.includes('.supabase.co')) {
    console.warn('[SupabaseConfig] Invalid Supabase URL format.');
    return { ok: false, reason: 'Invalid URL' };
  }

  if (!SUPABASE_ANON_KEY.startsWith('eyJ')) {
    console.warn('[SupabaseConfig] Invalid anon key format (should be a JWT).');
    return { ok: false, reason: 'Invalid key' };
  }

  try {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return { ok: true, client };
  } catch (e) {
    console.error('[SupabaseConfig] Failed to create client:', e);
    return { ok: false, reason: 'Client creation failed' };
  }
}

window.initSupabase = initSupabase;
window.SUPABASE_CONFIG = Object.freeze({
  SYNC_DEBOUNCE_MS,
  DAILY_STATS_SYNC_DAYS,
  MAX_FRIENDS,
  LEADERBOARD_LIMIT,
});
