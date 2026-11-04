"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { COUNTRIES, getCountry } from "@/lib/countries";
import { isValidTz } from "@/lib/time";
import { after } from "next/server";
import { notifyBooking } from "@/lib/notify";
import { getKind } from "@/lib/templates";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function decideChange(id: string, approve: boolean) {
  const { supabase, business } = await requireBusiness();
  const { data: b } = await supabase.from("bookings").select("token, starts_at").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!b) return;
  const { data: result } = await supabase.rpc("decide_reschedule", { p_booking_id: id, p_approve: approve });
  if (result === "approved") after(() => notifyBooking(b.token, "change_approved", b.starts_at));
  if (result === "declined") after(() => notifyBooking(b.token, "change_declined"));
  revalidatePath("/dashboard", "layout");
}

export async function setBookingStatus(id: string, status: "completed" | "no_show" | "cancelled") {
  const { supabase, business } = await requireBusiness();
  await supabase.from("bookings").update({ status }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

const url = z.string().trim().max(300).url().or(z.literal(""));
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  country: z.string().refine((c) => COUNTRIES.some((x) => x.code === c)),
  timezone: z.string().max(60).refine(isValidTz),
  phone: z.string().trim().max(20),
  whatsapp: z.string().trim().max(20),
  address: z.string().trim().max(200),
  maps_url: url,
  facebook: url,
  instagram: url,
  tiktok: url,
});

export async function saveProfile(_: unknown, form: FormData) {
  const { supabase, business } = await requireBusiness();
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path.join(".") };
  const v: Record<string, unknown> = Object.fromEntries(Object.entries(parsed.data).map(([k, x]) => [k, x === "" ? null : x]));
  v.currency = getCountry(parsed.data.country).currency;
  const { error } = await supabase.from("businesses").update(v).eq("id", business.id);
  revalidatePath("/dashboard", "layout");
  return { ok: !error };
}

export async function setMedia(field: "logo_url" | "cover_url", publicUrl: string | null) {
  const { supabase, business } = await requireBusiness();
  if (publicUrl && !publicUrl.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL!)) return;
  await supabase.from("businesses").update({ [field]: publicUrl }).eq("id", business.id);
  revalidatePath("/dashboard", "layout");
}

// ----- services -----
const serviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  section: z.string().trim().max(30),
  price: z.coerce.number().min(0).max(1_000_000_000).transform((n) => Math.round(n * 100) / 100),
  duration_min: z.coerce.number().int().min(5).max(600),
});
/** "1 kg = 3500" per line → [{label, price}] */
function parseSizes(text: string) {
  return text.split(/\n|;/).map((l) => l.trim()).filter(Boolean).slice(0, 12).map((l) => {
    const m = l.match(/^(.{1,40}?)\s*[=:-]\s*([\d.,]+)\s*$/);
    return m ? { label: m[1].trim(), price: Math.max(0, Number(m[2].replace(/,/g, "")) || 0) } : null;
  }).filter((x): x is { label: string; price: number } => !!x);
}
export async function upsertService(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const id = form.get("id") as string | null;
  const raw = Object.fromEntries(form);
  if (!raw.duration_min) raw.duration_min = "30";
  const parsed = serviceSchema.safeParse(raw);
  if (!parsed.success) return;
  const row: Record<string, unknown> = { ...parsed.data };
  if (form.has("description")) row.description = String(form.get("description") ?? "").trim().slice(0, 120) || null;
  if (form.has("sizes") || form.has("flavours")) {
    const sizes = parseSizes(String(form.get("sizes") ?? ""));
    const flavours = String(form.get("flavours") ?? "").split(",").map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 20);
    row.options = { ...(sizes.length ? { sizes } : {}), ...(flavours.length ? { flavours } : {}) };
    if (sizes.length) row.price = Math.min(...sizes.map((x) => x.price)); // "from" price
  }
  const save = (r: Record<string, unknown>) => (id
    ? supabase.from("services").update(r).eq("id", id).eq("business_id", business.id)
    : supabase.from("services").insert({ ...r, business_id: business.id }));
  const { error } = await save(row);
  if (error) await save(parsed.data); // before migration 007: save the basics
  revalidatePath("/dashboard", "layout");
}
export async function setServiceImage(id: string, publicUrl: string | null) {
  const { supabase, business } = await requireBusiness();
  if (publicUrl && !publicUrl.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL!)) return;
  await supabase.from("services").update({ image_url: publicUrl }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

// ----- booking / order rules -----
export async function saveRules(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const num = (k: string, min: number, max: number, def: number) => Math.min(max, Math.max(min, Math.round(Number(form.get(k) ?? def) || 0)));
  const money = (k: string) => Math.max(0, Math.round((Number(form.get(k) ?? 0) || 0) * 100) / 100);
  const kind = getKind(String(form.get("type") ?? business.type));
  const row: Record<string, unknown> = { type: kind.id, mode: kind.mode };
  if (kind.mode === "orders") {
    row.daily_limit = num("daily_limit", 1, 500, 6);
    row.lead_days = num("lead_days", 0, 60, 1);
    row.advance_pct = num("advance_pct", 0, 100, 0);
    row.delivery_fee = form.get("delivery") === "on" ? money("delivery_fee") : null;
  } else {
    row.deposit_amount = money("deposit_amount");
    row.prep_note = String(form.get("prep_note") ?? "").trim().slice(0, 300) || null;
  }
  const { error } = await supabase.from("businesses").update(row).eq("id", business.id);
  if (error) console.error("saveRules", error.message);
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/${business.slug}`);
}
export async function deleteService(form: FormData) {
  const { supabase, business } = await requireBusiness();
  await supabase.from("services").update({ active: false }).eq("id", String(form.get("id"))).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

// ----- staff -----
export async function addStaff(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (name) await supabase.from("staff").insert({ business_id: business.id, name });
  revalidatePath("/dashboard", "layout");
}
export async function saveStaffInfo(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const specialty = String(form.get("specialty") ?? "").trim().slice(0, 60) || null;
  if (!id || !name) return;
  const { error } = await supabase.from("staff").update({ name, specialty }).eq("id", id).eq("business_id", business.id);
  if (error) await supabase.from("staff").update({ name }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}
export async function setStaffPortfolio(id: string, urls: string[]) {
  const { supabase, business } = await requireBusiness();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const clean = urls.filter((u) => typeof u === "string" && u.startsWith(base)).slice(0, 12);
  await supabase.from("staff").update({ portfolio: clean }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}
export async function removeStaff(form: FormData) {
  const { supabase, business } = await requireBusiness();
  await supabase.from("staff").update({ active: false }).eq("id", String(form.get("id"))).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

// ----- branches -----
export async function addBranch(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (name) await supabase.from("branches").insert({ business_id: business.id, name });
  revalidatePath("/dashboard", "layout");
}
export async function removeBranch(form: FormData) {
  const { supabase, business } = await requireBusiness();
  await supabase.from("branches").delete().eq("id", String(form.get("id"))).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

// ----- hours -----
export async function saveHours(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const rows = [0, 1, 2, 3, 4, 5, 6].map((w) => ({
    business_id: business.id,
    weekday: w,
    is_open: form.get(`open_${w}`) === "on",
    open_time: String(form.get(`from_${w}`) || "09:00"),
    close_time: String(form.get(`to_${w}`) || "20:00"),
  })).filter((r) => r.close_time > r.open_time);
  await supabase.from("business_hours").upsert(rows);
  revalidatePath("/dashboard", "layout");
}
export async function setServiceImages(id: string, urls: string[]) {
  await setServiceImage(id, urls[0] ?? null);
}
