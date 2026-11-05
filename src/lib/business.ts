import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Business = {
  id: string; slug: string; name: string; type: string; sections: string[];
  logo_url: string | null; cover_url: string | null; phone: string | null; whatsapp: string | null;
  address: string | null; maps_url: string | null; facebook: string | null; instagram: string | null;
  tiktok: string | null; plan: string; is_published: boolean;
  country: string; currency: string; timezone: string;
  notify_email: boolean; notify_push: boolean;
  // migration 007 (may be missing on older databases → treat as a salon)
  mode?: "slots" | "orders"; daily_limit?: number; lead_days?: number; delivery_fee?: number | null;
  advance_pct?: number; deposit_amount?: number; prep_note?: string | null;
  // migration 008
  plan_until?: string | null; brand_color?: string | null; hide_branding?: boolean;
};

/** The logged-in owner's business. Redirects to /login or /onboarding when missing. */
export const requireBusiness = cache(async () => {
  const supabase = await createClient();
  const user = await getUserFast(supabase);
  if (!user) redirect("/login");
  const { data } = await supabase.from("businesses").select("*").eq("owner_id", user.id).maybeSingle();
  if (!data) redirect("/onboarding");
  return { supabase, user, business: data as Business };
});

/** Verifies the session JWT locally when possible (no extra network round-trip). */
export async function getUserFast(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return sub ? { id: sub as string, email: (data?.claims?.email as string | undefined) ?? null } : null;
}
