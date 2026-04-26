import "server-only";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS — only
 * use from worker / cron / API routes that have already done their own
 * authorization. Never import this from client components.
 */
export function createAdminClient() {
  const env = getSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) return null;
  return createSbClient(env.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
