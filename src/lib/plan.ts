import { planPrices } from "./countries";

export const FREE_LIMIT = 50;
export const WARN_AT = 40;
export type PlanName = "free" | "pro" | "ai";

/** The plan in force right now (an expired Pro counts as Free). */
export function effectivePlan(b: { plan?: string | null; plan_until?: string | null }): PlanName {
  const p = (b.plan ?? "free") as PlanName;
  if (p === "free") return "free";
  return !b.plan_until || new Date(b.plan_until) > new Date() ? p : "free";
}
export const isPro = (b: { plan?: string | null; plan_until?: string | null }) => effectivePlan(b) !== "free";

/** Pro price for 1 or 12 months (yearly = 10 months, 2 free). */
export function upgradePrice(currency: string, months: 1 | 12, plan: "pro" | "ai" = "pro") {
  const { currency: cur, prices } = planPrices(currency);
  const monthly = plan === "ai" ? prices[2] : prices[1];
  return { currency: cur, amount: monthly * (months === 12 ? 10 : 1), monthly, ai: prices[2] };
}
export const AI_CHATS = 500;

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
/** Online bookings + orders this month (null before migration 008). */
export async function monthUsage(supabase: Rpc, businessId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("month_usage", { p_business: businessId });
  return error ? null : Number(data ?? 0);
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
