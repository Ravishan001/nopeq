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
export async function upsertService(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const id = form.get("id") as string | null;
  const parsed = serviceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  if (id) await supabase.from("services").update(parsed.data).eq("id", id).eq("business_id", business.id);
  else await supabase.from("services").insert({ ...parsed.data, business_id: business.id });
  revalidatePath("/dashboard", "layout");
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
