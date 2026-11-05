"use server";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/business";
import { isPro, upgradePrice } from "@/lib/plan";

/** Creates (or reuses) a bank-transfer reference for 1 or 12 months of Pro. */
export async function createUpgrade(months: 1 | 12, plan: "pro" | "ai" = "pro"): Promise<{ reference?: string; amount?: number; currency?: string; error?: string }> {
  if ((months !== 1 && months !== 12) || (plan !== "pro" && plan !== "ai")) return { error: "invalid" };
  const { supabase, business } = await requireBusiness();
  const price = upgradePrice(business.currency, months, plan);
  // migration 009 adds the plan argument; before it, only Pro can be bought
  let { data, error } = await supabase.rpc("request_upgrade", { p_business: business.id, p_months: months, p_amount: price.amount, p_currency: price.currency, p_plan: plan });
  if (error && plan === "pro") ({ data, error } = await supabase.rpc("request_upgrade", { p_business: business.id, p_months: months, p_amount: price.amount, p_currency: price.currency }));
  if (error) return { error: error.message.includes("too_many") ? "too_many" : "server" };
  revalidatePath("/dashboard/settings");
  return { reference: data as string, amount: price.amount, currency: price.currency };
}

/** The slip is already in the private "slips" bucket under <uid>/…; link it to the request. */
export async function attachSlip(reference: string, path: string): Promise<{ ok?: boolean; error?: string }> {
  if (!/^NQ-\d{4}$/.test(reference)) return { error: "invalid" };
  const { supabase, user } = await requireBusiness();
  if (!path.startsWith(`${user.id}/`)) return { error: "invalid" };
  const { data, error } = await supabase.rpc("attach_slip", { p_reference: reference, p_slip_path: path });
  if (error || !data) return { error: "server" };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Pro: brand colour + hide "powered by NopeQ". */
export async function saveBrand(form: FormData) {
  const { supabase, business } = await requireBusiness();
  if (!isPro(business)) return;
  const color = String(form.get("brand_color") ?? "");
  await supabase.from("businesses").update({
    brand_color: /^#[0-9a-fA-F]{6}$/.test(color) && color.toLowerCase() !== "#f0521f" ? color : null,
    hide_branding: form.get("hide_branding") === "on",
  }).eq("id", business.id);
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/${business.slug}`);
}
