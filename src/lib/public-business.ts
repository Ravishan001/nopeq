/**
 * Columns a visitor (not logged in) may read from `businesses` — must match the
 * column grants in supabase/migrations/010_public_columns.sql. Never use select("*")
 * for anonymous reads: the database refuses it and the page would 404.
 */
export const PUBLIC_BIZ_COLS =
  "id, slug, name, type, sections, logo_url, cover_url, phone, whatsapp, address, maps_url, facebook, instagram, tiktok, is_published, country, currency, timezone, " +
  "mode, daily_limit, lead_days, delivery_fee, advance_pct, deposit_amount, prep_note, plan, plan_until, brand_color, hide_branding, ai_enabled";
/** The columns that existed before migration 007 (fallback if 010 hasn't been run yet). */
export const BASE_BIZ_COLS = "id, slug, name, type, sections, logo_url, cover_url, phone, whatsapp, address, maps_url, facebook, instagram, tiktok, is_published, country, currency, timezone";

type Q = { from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { eq: (a: string, b: boolean) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }> } } } } };

/** Public business row by slug, with a fallback so the page never breaks on an older database. */
export async function loadPublicBusiness(supabase: Q, slug: string): Promise<Record<string, unknown> | null> {
  let { data, error } = await supabase.from("businesses").select(PUBLIC_BIZ_COLS).eq("slug", slug).eq("is_published", true).maybeSingle();
  if (error) {
    console.error("public business (falling back to base columns — run migration 010):", error.message);
    ({ data, error } = await supabase.from("businesses").select(BASE_BIZ_COLS).eq("slug", slug).eq("is_published", true).maybeSingle());
  }
  if (error) console.error("public business:", error.message);
  return (data as Record<string, unknown> | null) ?? null;
}
