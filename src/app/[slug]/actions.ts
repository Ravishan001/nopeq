"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { freeSlots, type Busy } from "@/lib/slots";
import { dayRange, TZ_OFFSET } from "@/lib/time";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function getSlots(businessId: string, day: string, serviceId: string, staffId: string | null) {
  if (!uuid.safeParse(businessId).success || !date.safeParse(day).success || !uuid.safeParse(serviceId).success) return { closed: true, slots: [] };
  const supabase = await createClient();
  const weekday = new Date(`${day}T12:00:00${TZ_OFFSET}`).getUTCDay();
  const { from, to } = dayRange(day);
  const [hours, service, staff, busy] = await Promise.all([
    supabase.from("business_hours").select("*").eq("business_id", businessId).eq("weekday", weekday).maybeSingle(),
    supabase.from("services").select("duration_min").eq("id", serviceId).eq("business_id", businessId).maybeSingle(),
    supabase.from("staff").select("id").eq("business_id", businessId).eq("active", true),
    supabase.rpc("busy_ranges", { p_business_id: businessId, p_from: from, p_to: to }),
  ]);
  if (!hours.data?.is_open || !service.data) return { closed: true, slots: [] };
  const slots = freeSlots({
    date: day,
    open: hours.data.open_time.slice(0, 5),
    close: hours.data.close_time.slice(0, 5),
    duration: service.data.duration_min,
    staffIds: (staff.data ?? []).map((s) => s.id),
    staffId: staffId && uuid.safeParse(staffId).success ? staffId : null,
    busy: (busy.data ?? []) as Busy[],
  });
  return { closed: false, slots };
}

const bookingSchema = z.object({
  businessId: uuid, branchId: uuid.nullable(), serviceId: uuid, staffId: uuid.nullable(),
  date, time: z.string().regex(/^\d\d:\d\d$/),
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().regex(/^(\+94|0)7\d[\d ]{7,9}$/),
  note: z.string().trim().max(300).optional(),
  website: z.string().max(0).optional(), // honeypot: bots fill this, humans don't see it
});

export async function book(input: z.infer<typeof bookingSchema>): Promise<{ token?: string; error?: string }> {
  const p = bookingSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues.some((i) => i.path[0] === "phone") ? "phone" : "generic" };
  const d = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_slot", {
    p_business_id: d.businessId, p_branch_id: d.branchId, p_service_id: d.serviceId, p_staff_id: d.staffId,
    p_name: d.name, p_phone: d.phone.replace(/\s/g, ""), p_starts_at: `${d.date}T${d.time}:00${TZ_OFFSET}`, p_note: d.note ?? null,
  });
  if (error) {
    const m = error.message;
    return { error: m.includes("slot_taken") ? "slot_taken" : m.includes("too_many") ? "too_many" : "generic" };
  }
  return { token: data as string };
}
