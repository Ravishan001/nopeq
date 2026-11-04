"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/business";
import { KINDS, RESERVED_SLUGS, getKind } from "@/lib/templates";
import { COUNTRIES, getCountry } from "@/lib/countries";
import { isValidTz } from "@/lib/time";

const schema = z.object({
  type: z.string().refine((k) => KINDS.some((x) => x.id === k)),
  country: z.string().length(2).refine((c) => COUNTRIES.some((x) => x.code === c)),
  timezone: z.string().max(60).refine(isValidTz),
  name: z.string().trim().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/),
  sections: z.array(z.string().max(30)).max(10),
  branches: z.array(z.string().trim().min(1).max(60)).max(20),
  services: z.array(z.object({
    section: z.string().max(30),
    name: z.string().trim().min(1).max(80),
    price: z.number().min(0).max(1_000_000_000),
    duration: z.number().int().min(5).max(600),
    description: z.string().trim().max(120).optional(),
    options: z.object({
      sizes: z.array(z.object({ label: z.string().trim().min(1).max(40), price: z.number().min(0).max(1_000_000_000) })).max(12).optional(),
      flavours: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    }).optional(),
  })).min(1).max(100),
  staff: z.array(z.string().trim().min(1).max(60)).max(50),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  open: z.string().regex(/^\d\d:\d\d$/),
  close: z.string().regex(/^\d\d:\d\d$/),
  dailyLimit: z.number().int().min(1).max(500).default(6),
  leadDays: z.number().int().min(0).max(60).default(1),
});

export type OnboardingInput = z.infer<typeof schema>;

export async function checkSlug(slug: string) {
  if (RESERVED_SLUGS.has(slug) || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("id").eq("slug", slug).maybeSingle();
  return !data;
}

export async function createBusiness(input: OnboardingInput): Promise<{ error: string } | void> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const d = parsed.data;
  if (d.close <= d.open) return { error: "hours" };
  if (RESERVED_SLUGS.has(d.slug)) return { error: "slug" };

  const supabase = await createClient();
  const user = await getUserFast(supabase);
  if (!user) redirect("/login");

  const { data: biz, error } = await supabase
    .from("businesses")
    .insert({ owner_id: user.id, slug: d.slug, name: d.name, type: d.type, mode: getKind(d.type).mode, daily_limit: d.dailyLimit, lead_days: d.leadDays,
      sections: d.sections, setup_method: "manual",
      country: d.country, currency: getCountry(d.country).currency, timezone: d.timezone })
    .select("id")
    .single();
  if (error || !biz) {
    console.error("createBusiness insert", error);
    if (error?.code === "23505") return { error: error.message.includes("one_per_owner") ? "exists" : "slug" };
    return { error: `db: ${error?.message ?? "unknown"}` };
  }

  const id = biz.id;
  const results = await Promise.all([
    d.branches.length ? supabase.from("branches").insert(d.branches.map((name) => ({ business_id: id, name }))) : null,
    supabase.from("services").insert(d.services.map((s, i) => ({ business_id: id, name: s.name, section: s.section, price: Math.round(s.price * 100) / 100, duration_min: s.duration, sort: i,
      ...(s.description ? { description: s.description } : {}), ...(s.options ? { options: s.options } : {}) }))),
    d.staff.length ? supabase.from("staff").insert(d.staff.map((name) => ({ business_id: id, name }))) : null,
    supabase.from("business_hours").insert(
      [0, 1, 2, 3, 4, 5, 6].map((w) => ({ business_id: id, weekday: w, is_open: d.days.includes(w), open_time: d.open, close_time: d.close }))
    ),
  ]);
  const failed = results.find((r) => r?.error)?.error;
  if (failed) {
    console.error("createBusiness children", failed);
    await supabase.from("businesses").delete().eq("id", id); // roll back so the owner can try again
    return { error: `db: ${failed.message}` };
  }
  redirect("/dashboard?welcome=1");
}
