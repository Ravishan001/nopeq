import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Business = {
  id: string; slug: string; name: string; type: string; sections: string[];
  logo_url: string | null; cover_url: string | null; phone: string | null; whatsapp: string | null;
  address: string | null; maps_url: string | null; facebook: string | null; instagram: string | null;
  tiktok: string | null; plan: string; is_published: boolean;
};

/** The logged-in owner's business. Redirects to /login or /onboarding when missing. */
export async function requireBusiness() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("businesses").select("*").eq("owner_id", user.id).maybeSingle();
  if (!data) redirect("/onboarding");
  return { supabase, user, business: data as Business };
}
