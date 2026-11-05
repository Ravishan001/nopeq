import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { isPro } from "./plan";

/** Public branding info for a slug (used by icons, manifests and the booking page). */
export const loadBrand = cache(async (slug: string) => {
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!data) return null;
  const b = data as { name: string; slug: string; logo_url: string | null; plan: string; plan_until: string | null; brand_color?: string | null };
  return { name: b.name, slug: b.slug, logo: b.logo_url, pro: isPro(b), color: b.brand_color || "#F0521F" };
});
