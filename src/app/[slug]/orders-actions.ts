"use server";
import { z } from "zod";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyOrder } from "@/lib/notify";
import { getCountry, normalizePhone } from "@/lib/countries";
import { isOwnRef } from "./upload-action";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type OrderDay = { day: string; taken: number; closed: boolean };

/** How many orders each day already has (counts only). */
export async function getOrderDays(businessId: string, from: string, to: string): Promise<OrderDay[]> {
  if (!uuid.safeParse(businessId).success || !date.safeParse(from).success || !date.safeParse(to).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_days", { p_business_id: businessId, p_from: from, p_to: to });
  if (error) { console.error("order_days", error.message); return []; }
  return ((data ?? []) as { day: string; taken: number; closed: boolean }[]).map((d) => ({ day: String(d.day).slice(0, 10), taken: Number(d.taken), closed: !!d.closed }));
}

const orderSchema = z.object({
  businessId: uuid, serviceId: uuid,
  size: z.string().max(40).nullable(), flavour: z.string().max(40).nullable(),
  message: z.string().trim().max(80).optional(), designUrl: z.string().max(400).nullable(),
  fulfilment: z.enum(["pickup", "delivery"]), address: z.string().trim().max(200).optional(),
  due: date, timePref: z.enum(["morning", "afternoon", "evening"]).nullable(),
  name: z.string().trim().min(2).max(60), phone: z.string().trim().min(6).max(24),
  note: z.string().trim().max(300).optional(),
  website: z.string().max(0).optional(), // honeypot
});

export async function placeOrder(input: z.infer<typeof orderSchema>): Promise<{ token?: string; error?: string }> {
  const p = orderSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues.some((i) => i.path[0] === "phone") ? "phone" : "generic" };
  const d = p.data;
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("country").eq("id", d.businessId).maybeSingle();
  if (!biz) return { error: "generic" };
  const phone = normalizePhone(d.phone, getCountry(biz.country).dial);
  if (!phone) return { error: "phone" };
  if (d.designUrl && !(await isOwnRef(d.designUrl, d.businessId))) return { error: "generic" };
  const { data, error } = await supabase.rpc("place_order", {
    p_business_id: d.businessId, p_service_id: d.serviceId, p_size: d.size, p_flavour: d.flavour, p_message: d.message ?? null,
    p_design_url: d.designUrl, p_fulfilment: d.fulfilment, p_address: d.address ?? null, p_due: d.due, p_time_pref: d.timePref,
    p_name: d.name, p_phone: phone, p_note: d.note ?? null,
  });
  if (error) {
    const m = error.message;
    const known = ["day_full", "too_soon", "closed", "too_many", "address", "bad_size", "bad_flavour"].find((k) => m.includes(k));
    if (!known) console.error("place_order", m);
    return { error: known ?? "generic" };
  }
  const token = data as string;
  after(() => notifyOrder(token));
  return { token };
}
