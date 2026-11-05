"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { pushToOwner } from "@/lib/push";
import { fmtDate } from "@/lib/plan";

const uuid = z.string().uuid();
const addMonths = (from: Date, months: number) => { const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + months); return d; };

async function extend(db: Awaited<ReturnType<typeof requireAdmin>>["db"], businessId: string, months: number, plan: "pro" | "ai" = "pro") {
  const { data: b } = await db.from("businesses").select("plan, plan_until, owner_id, name").eq("id", businessId).maybeSingle();
  if (!b) return null;
  const base = b.plan !== "free" && b.plan_until && new Date(b.plan_until) > new Date() ? new Date(b.plan_until) : new Date();
  const until = addMonths(base, months).toISOString();
  const { error } = await db.from("businesses").update({ plan, plan_until: until }).eq("id", businessId);
  if (error) throw new Error(error.message);
  return { until, owner: b.owner_id as string, name: b.name as string };
}

export async function approvePayment(id: string) {
  if (!uuid.safeParse(id).success) return;
  const { db } = await requireAdmin();
  const { data: r } = await db.from("payment_requests").select("business_id, months, status, plan").eq("id", id).maybeSingle();
  if (!r || r.status !== "pending") return;
  const res = await extend(db, r.business_id, r.months, r.plan === "ai" ? "ai" : "pro");
  await db.from("payment_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", id);
  if (res) await pushToOwner(db, res.owner, { title: r.plan === "ai" ? "🤖 AI plan activated!" : "⭐ Pro activated!", body: `${res.name} is on ${r.plan === "ai" ? "the AI plan" : "Pro"} until ${fmtDate(res.until)}.\nTap to get your new app icon.`, url: "/dashboard/settings?tab=plan", tag: "plan" }).catch(() => 0);
  revalidatePath("/admin");
}

export async function rejectPayment(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!uuid.safeParse(id).success) return;
  const { db } = await requireAdmin();
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  const { data: r } = await db.from("payment_requests").update({ status: "rejected", admin_note: note, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("business_id").maybeSingle();
  if (r) {
    const { data: b } = await db.from("businesses").select("owner_id").eq("id", r.business_id).maybeSingle();
    if (b) await pushToOwner(db, b.owner_id, { title: "Payment not approved", body: note ?? "Please check your payment and try again.", url: "/dashboard/settings?tab=plan", tag: "plan" }).catch(() => 0);
  }
  revalidatePath("/admin");
}

/** Set a plan by hand: free, or add 1 / 12 months of Pro. */
export async function setPlan(form: FormData) {
  const id = String(form.get("id") ?? "");
  const v = String(form.get("plan") ?? "");
  if (!uuid.safeParse(id).success) return;
  const { db } = await requireAdmin();
  if (v === "free") await db.from("businesses").update({ plan: "free", plan_until: null }).eq("id", id);
  else if (["pro1", "pro12", "ai1", "ai12"].includes(v)) await extend(db, id, v.endsWith("12") ? 12 : 1, v.startsWith("ai") ? "ai" : "pro");
  revalidatePath("/admin");
}

export async function saveBank(form: FormData) {
  const { db } = await requireAdmin();
  const f = (k: string) => String(form.get(k) ?? "").trim().slice(0, 120) || null;
  await db.from("billing_settings").upsert({ id: 1, account_name: f("account_name"), bank: f("bank"), branch: f("branch"), account_no: f("account_no"), note: f("note"), updated_at: new Date().toISOString() });
  revalidatePath("/admin");
}
