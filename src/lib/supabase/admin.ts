import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client. SERVER ONLY — bypasses RLS, used just for sending notifications. */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
