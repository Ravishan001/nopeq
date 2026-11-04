"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/business";
import { dayRange, weekdayOf, zonedToUtc } from "@/lib/time";

export type BoardItem = {
  id: string; kind: "booking" | "request" | "block";
  staff_id: string | null; starts_at: string; ends_at: string;
  title: string; sub?: string; status?: string; source?: string;
  customer?: string; phone?: string | null; price?: number; refs?: string[]; placement?: string | null;
};
export type BoardData = { date: string; open: string | null; close: string | null; items: BoardItem[]; needsSql?: boolean };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Everything the owner's slot board needs for one day. */
export async function getBoard(day: string): Promise<BoardData> {
  if (!date.safeParse(day).success) return { date: day, open: null, close: null, items: [] };
  const { supabase, business } = await requireBusiness();
  const { from, to } = dayRange(day, business.timezone);
  const COLS = "id, starts_at, ends_at, status, staff_id, source, customer_name, customer_phone, request_status, requested_starts_at, requested_ends_at, requested_staff_id, services(name, price)";
  // Older databases (before migration 006/005) miss some columns: fall back step by step so the board never goes blank.
  const LEGACY = [`${COLS}, ref_urls, placement`, COLS, COLS.replace("source, ", ""), "id, starts_at, ends_at, status, staff_id, customer_name, customer_phone, services(name, price)"];
  const load = async (cols: string, withRequests: boolean) => Promise.all([
    supabase.from("bookings").select(cols).eq("business_id", business.id).neq("status", "cancelled").lt("starts_at", to).gt("ends_at", from),
    withRequests
      ? supabase.from("bookings").select(cols).eq("business_id", business.id).eq("status", "confirmed").eq("request_status", "pending")
        .lt("requested_starts_at", to).gt("requested_ends_at", from)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const [hours, blocks] = await Promise.all([
    supabase.from("business_hours").select("is_open, open_time, close_time").eq("business_id", business.id).eq("weekday", weekdayOf(day)).maybeSingle(),
    supabase.from("time_blocks").select("id, staff_id, starts_at, ends_at, label").eq("business_id", business.id).lt("starts_at", to).gt("ends_at", from),
  ]);
  let level = 0;
  let [onDay, requests] = await load(LEGACY[0], true);
  while ((onDay.error || requests.error) && level < LEGACY.length - 1) {
    level++;
    [onDay, requests] = await load(LEGACY[level], level < 3);
  }
  if (onDay.error) console.error("getBoard", onDay.error.message);
  const needsSql = level > 1 || !!blocks.error;
  const seen = new Set<string>();
  const bookings = { data: [...((onDay.data ?? []) as unknown[]), ...((requests.data ?? []) as unknown[])].filter((b) => { const id = (b as { id: string }).id; return seen.has(id) ? false : (seen.add(id), true); }) };

  const items: BoardItem[] = [];
  type B = { id: string; starts_at: string; ends_at: string; status: string; staff_id: string | null; source: string; customer_name: string; customer_phone: string | null;
    request_status: string | null; requested_starts_at: string | null; requested_ends_at: string | null; requested_staff_id: string | null; services: { name: string; price: number } | null; ref_urls?: string[]; placement?: string | null };
  for (const b of (bookings.data ?? []) as unknown as B[]) {
    if (b.starts_at < to && b.ends_at > from) {
      items.push({ id: b.id, kind: "booking", staff_id: b.staff_id, starts_at: b.starts_at, ends_at: b.ends_at, title: b.services?.name ?? "Booking",
        status: b.status, source: b.source ?? "online", customer: b.customer_name, phone: b.customer_phone, price: b.services ? Number(b.services.price) : undefined,
        refs: b.ref_urls ?? [], placement: b.placement ?? null });
    }
    if (b.request_status === "pending" && b.requested_starts_at && b.requested_ends_at && b.requested_starts_at < to && b.requested_ends_at > from) {
      items.push({ id: `${b.id}-req`, kind: "request", staff_id: b.requested_staff_id, starts_at: b.requested_starts_at, ends_at: b.requested_ends_at,
        title: "Change request", sub: b.services?.name, customer: b.customer_name, phone: b.customer_phone });
    }
  }
  for (const t of blocks.data ?? []) {
    items.push({ id: t.id, kind: "block", staff_id: t.staff_id, starts_at: t.starts_at, ends_at: t.ends_at, title: t.label || "Blocked" });
  }
  const h = hours.data;
  return { date: day, open: h?.is_open ? h.open_time.slice(0, 5) : null, close: h?.is_open ? h.close_time.slice(0, 5) : null, items, needsSql };
}

const walkin = z.object({
  date, time: z.string().regex(/^\d\d:\d\d$/), staffId: z.string().uuid().nullable(), serviceId: z.string().uuid(),
  name: z.string().trim().max(60).optional(), phone: z.string().trim().max(20).optional(),
});
export async function addWalkin(input: z.infer<typeof walkin>): Promise<{ ok?: boolean; error?: string }> {
  const p = walkin.safeParse(input);
  if (!p.success) return { error: "invalid" };
  const { supabase, business } = await requireBusiness();
  const d = p.data;
  const { error } = await supabase.rpc("add_walkin", {
    p_business_id: business.id, p_staff_id: d.staffId, p_service_id: d.serviceId,
    p_starts_at: zonedToUtc(d.date, d.time, business.timezone).toISOString(), p_name: d.name || null, p_phone: d.phone || null,
  });
  if (error) return { error: error.message.includes("slot_taken") ? "slot_taken" : error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const block = z.object({
  date, time: z.string().regex(/^\d\d:\d\d$/), minutes: z.number().int().min(15).max(24 * 60),
  staffId: z.string().uuid().nullable(), label: z.string().trim().max(40).optional(),
});
export async function addBlock(input: z.infer<typeof block>): Promise<{ ok?: boolean; error?: string }> {
  const p = block.safeParse(input);
  if (!p.success) return { error: "invalid" };
  const { supabase, business } = await requireBusiness();
  const start = zonedToUtc(p.data.date, p.data.time, business.timezone);
  const { error } = await supabase.from("time_blocks").insert({
    business_id: business.id, staff_id: p.data.staffId, label: p.data.label || null,
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + p.data.minutes * 60_000).toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function removeBlock(id: string) {
  if (!z.string().uuid().safeParse(id).success) return;
  const { supabase, business } = await requireBusiness();
  await supabase.from("time_blocks").delete().eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard", "layout");
}
