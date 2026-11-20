import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client — server side only. Never send this key to a
 * browser. Every table read/write in this codebase goes through here.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const rawUrl = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }

  // supabase-js wants the bare project origin. A pasted dashboard URL with a
  // trailing slash or /rest/v1 path makes PostgREST answer PGRST125
  // "Invalid path specified in request URL", so strip everything but the origin.
  let url: string;
  try {
    url = new URL(rawUrl).origin;
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL (expected https://<ref>.supabase.co)');
  }

  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
