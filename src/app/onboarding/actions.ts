"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RESERVED_SLUGS } from "@/lib/templates";

const schema = z.object({
  type: z.literal("salon"),
  name: z.string().trim().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/),
  sections: z.array(z.string().max(30)).max(10),
  branches: z.array(z.string().trim().min(1).max(60)).max(20),
  services: z.array(z.object({
    section: z.string().max(30),
    name: z.string().trim().min(1).max(80),
    price: z.number().int().min(0).max(10_000_000),
    duration: z.number().int().min(5).max(600),
  })).min(1).max(100),
  staff: z.array(z.string().trim().min(1).max(60)).max(50),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  open: z.string().regex(/^\d\d:\d\d$/),
  close: z.string().regex(/^\d\d:\d\d$/),
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz, error } = await supabase
    .from("businesses")
    .insert({ owner_id: user.id, slug: d.slug, name: d.name, type: d.type, sections: d.sections, setup_method: "manual" })
    .select("id")
    .single();
  if (error || !biz) return { error: error?.code === "23505" ? "slug" : "db" };

  const id = biz.id;
  const results = await Promise.all([
    d.branches.length ? supabase.from("branches").insert(d.branches.map((name) => ({ business_id: id, name }))) : null,
    supabase.from("services").insert(d.services.map((s, i) => ({ business_id: id, name: s.name, section: s.section, price: s.price, duration_min: s.duration, sort: i }))),
    d.staff.length ? supabase.from("staff").insert(d.staff.map((name) => ({ business_id: id, name }))) : null,
    supabase.from("business_hours").insert(
      [0, 1, 2, 3, 4, 5, 6].map((w) => ({ business_id: id, weekday: w, is_open: d.days.includes(w), open_time: d.open, close_time: d.close }))
    ),
  ]);
  if (results.some((r) => r?.error)) return { error: "db" };
  redirect("/dashboard?welcome=1");
}
