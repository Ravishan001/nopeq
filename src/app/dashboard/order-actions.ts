"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/business";
import { getCountry, normalizePhone } from "@/lib/countries";
import { readOptions } from "@/lib/templates";
import { todayIn } from "@/lib/time";

export type Order = {
  id: string; item_name: string; size: string | null; flavour: string | null; message: string | null; design_url: string | null;
  fulfilment: "pickup" | "delivery"; address: string | null; due_date: string; time_pref: string | null;
  customer_name: string; customer_phone: string | null; note: string | null; total: number; advance: number; advance_paid: boolean;
  status: OrderStatus; source: string; created_at: string;
};
export type OrderStatus = "new" | "confirmed" | "making" | "ready" | "done" | "cancelled";
export type MonthData = { month: string; counts: Record<string, number>; closed: string[] };
export type OrderStats = { toConfirm: number; week: number; expected: number };

const COLS = "id, item_name, size, flavour, message, design_url, fulfilment, address, due_date, time_pref, customer_name, customer_phone, note, total, advance, advance_paid, status, source, created_at";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const month = z.string().regex(/^\d{4}-\d{2}$/);
const norm = (o: Record<string, unknown>) => ({ ...o, due_date: String(o.due_date).slice(0, 10), total: Number(o.total), advance: Number(o.advance) }) as Order;

/** Order counts for every day of a month (+ the days the shop closed). */
export async function getMonth(m: string): Promise<MonthData> {
  if (!month.safeParse(m).success) return { month: m, counts: {}, closed: [] };
  const { supabase, business } = await requireBusiness();
  const [y, mm] = m.split("-").map(Number);
  const from = `${m}-01`;
  const to = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
  const [o, c] = await Promise.all([
    supabase.from("orders").select("due_date").eq("business_id", business.id).neq("status", "cancelled").gte("due_date", from).lte("due_date", to),
    supabase.from("closed_days").select("day").eq("business_id", business.id).gte("day", from).lte("day", to),
  ]);
  const counts: Record<string, number> = {};
  for (const r of o.data ?? []) { const d = String(r.due_date).slice(0, 10); counts[d] = (counts[d] ?? 0) + 1; }
  return { month: m, counts, closed: (c.data ?? []).map((r) => String(r.day).slice(0, 10)) };
}

export async function getDayOrders(day: string): Promise<Order[]> {
  if (!date.safeParse(day).success) return [];
  const { supabase, business } = await requireBusiness();
  const { data } = await supabase.from("orders").select(COLS).eq("business_id", business.id).eq("due_date", day)
    .order("status", { ascending: true }).order("created_at");
  const rank: Record<string, number> = { new: 0, confirmed: 1, making: 2, ready: 3, done: 4, cancelled: 5 };
  return (data ?? []).map(norm).sort((a, b) => rank[a.status] - rank[b.status]);
}

export async function getOrderStats(): Promise<OrderStats> {
  const { supabase, business } = await requireBusiness();
  const today = todayIn(business.timezone);
  const week = todayIn(business.timezone, 6);
  const [pending, next] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "new").gte("due_date", today),
    supabase.from("orders").select("total").eq("business_id", business.id).neq("status", "cancelled").gte("due_date", today).lte("due_date", week),
  ]);
  return { toConfirm: pending.count ?? 0, week: next.data?.length ?? 0, expected: (next.data ?? []).reduce((n, r) => n + Number(r.total), 0) };
}

/** Upcoming / past orders for the Orders tab. */
export async function listOrders(view: "upcoming" | "today" | "past"): Promise<Order[]> {
  const { supabase, business } = await requireBusiness();
  const today = todayIn(business.timezone);
  let q = supabase.from("orders").select(COLS).eq("business_id", business.id);
  q = view === "today" ? q.eq("due_date", today) : view === "upcoming" ? q.gte("due_date", today).neq("status", "cancelled").neq("status", "done") : q.lt("due_date", today);
  const { data } = await q.order("due_date", { ascending: view !== "past" }).order("created_at").limit(200);
  return (data ?? []).map(norm);
}

export async function setOrderStatus(id: string, status: OrderStatus) {
  if (!z.string().uuid().safeParse(id).success || !["new", "confirmed", "making", "ready", "done", "cancelled"].includes(status)) return;
  const { supabase, business } = await requireBusiness();
  await supabase.from("orders").update({ status }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

export async function setAdvancePaid(id: string, paid: boolean) {
  if (!z.string().uuid().safeParse(id).success) return;
  const { supabase, business } = await requireBusiness();
  await supabase.from("orders").update({ advance_paid: paid }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

export async function moveOrder(id: string, day: string) {
  if (!z.string().uuid().safeParse(id).success || !date.safeParse(day).success) return;
  const { supabase, business } = await requireBusiness();
  await supabase.from("orders").update({ due_date: day }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}

/** Close / reopen a day for new online orders. */
export async function toggleClosedDay(day: string): Promise<boolean> {
  if (!date.safeParse(day).success) return false;
  const { supabase, business } = await requireBusiness();
  const { data } = await supabase.from("closed_days").select("day").eq("business_id", business.id).eq("day", day).maybeSingle();
  if (data) await supabase.from("closed_days").delete().eq("business_id", business.id).eq("day", day);
  else await supabase.from("closed_days").insert({ business_id: business.id, day });
  revalidatePath("/dashboard", "layout");
  return !data;
}

const phoneOrder = z.object({
  day: date, serviceId: z.string().uuid(), size: z.string().max(40).nullable(), flavour: z.string().max(40).nullable(),
  message: z.string().trim().max(80).optional(), fulfilment: z.enum(["pickup", "delivery"]), address: z.string().trim().max(200).optional(),
  name: z.string().trim().min(2).max(60), phone: z.string().trim().max(24).optional(), total: z.number().min(0).max(1_000_000_000).nullable(),
});
/** Owner adds an order taken by phone / in the shop (the daily limit doesn't block the owner). */
export async function addPhoneOrder(input: z.infer<typeof phoneOrder>): Promise<{ ok?: boolean; error?: string }> {
  const p = phoneOrder.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.path[0] === "name" ? "name" : "invalid" };
  const d = p.data;
  const { supabase, business } = await requireBusiness();
  const { data: s } = await supabase.from("services").select("name, price, options").eq("id", d.serviceId).eq("business_id", business.id).maybeSingle();
  if (!s) return { error: "invalid" };
  const o = readOptions(s.options);
  const unit = o.sizes.length ? o.sizes.find((x) => x.label === d.size)?.price ?? Number(s.price) : Number(s.price);
  const fee = d.fulfilment === "delivery" ? Number(business.delivery_fee ?? 0) : 0;
  const phone = d.phone ? normalizePhone(d.phone, getCountry(business.country).dial) : null;
  if (d.phone && !phone) return { error: "phone" };
  const total = d.total ?? unit + fee;
  const { error } = await supabase.from("orders").insert({
    business_id: business.id, service_id: d.serviceId, item_name: s.name, size: o.sizes.length ? d.size : null, flavour: o.flavours.length ? d.flavour : null,
    message: d.message || null, fulfilment: d.fulfilment, address: d.fulfilment === "delivery" ? d.address || null : null, due_date: d.day,
    customer_name: d.name, customer_phone: phone, total, advance: Math.round((total * (business.advance_pct ?? 0)) / 100), status: "confirmed", source: "phone",
  });
  if (error) { console.error("addPhoneOrder", error.message); return { error: "invalid" }; }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
