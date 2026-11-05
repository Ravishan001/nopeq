import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { isPro } from "./plan";
import { loadPublicBusiness } from "./public-business";

/** Public branding info for a slug (used by icons, manifests and the booking page). */
export const loadBrand = cache(async (slug: string) => {
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return null;
  const supabase = await createClient();
  const data = await loadPublicBusiness(supabase as never, slug);
  if (!data) return null;
  const b = data as unknown as { name: string; slug: string; logo_url: string | null; plan: string; plan_until: string | null; brand_color?: string | null };
  return { name: b.name, slug: b.slug, logo: b.logo_url, pro: isPro(b), color: b.brand_color || "#F0521F" };
});
