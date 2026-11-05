import Link from "next/link";
import { Header } from "@/components/Header";
import { requireAdmin } from "@/lib/admin";
import { formatMoney } from "@/lib/countries";
import { FREE_LIMIT, effectivePlan, fmtDate } from "@/lib/plan";
import { getKind } from "@/lib/templates";
import { approvePayment, rejectPayment, saveBank, setPlan } from "./actions";

export const metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

type Req = { id: string; business_id: string; months: number; amount: number; currency: string; reference: string; slip_path: string | null; status: string; admin_note: string | null; created_at: string; decided_at: string | null };
type Biz = { id: string; name: string; slug: string; type: string; plan: string; plan_until: string | null; whatsapp: string | null; phone: string | null; address: string | null; country: string; currency: string; created_at: string };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { db } = await requireAdmin();
  const tab = (await searchParams).tab ?? "payments";

  const [reqs, bizs, bank] = await Promise.all([
    db.from("payment_requests").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("businesses").select("id, name, slug, type, plan, plan_until, whatsapp, phone, address, country, currency, created_at").order("created_at", { ascending: false }).limit(500),
    db.from("billing_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (reqs.error) return <div className="p-10">⚠️ Run supabase/migrations/008_plans_billing.sql first ({reqs.error.message})</div>;
  const requests = (reqs.data ?? []) as Req[];
  const businesses = (bizs.data ?? []) as Biz[];
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const pending = requests.filter((r) => r.status === "pending" && r.slip_path);
  const noSlip = requests.filter((r) => r.status === "pending" && !r.slip_path);
  const decided = requests.filter((r) => r.status !== "pending").slice(0, 20);
  const pro = businesses.filter((b) => effectivePlan(b) !== "free");
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const thisMonth = requests.filter((r) => r.status === "approved" && r.decided_at && new Date(r.decided_at) >= monthStart);
  const revenue = thisMonth.reduce((n, r) => n + Number(r.amount), 0);

  // signed links for slips (private bucket, 1 hour)
  const slipUrls = new Map<string, string>();
  await Promise.all(pending.map(async (r) => {
    const { data } = await db.storage.from("slips").createSignedUrl(r.slip_path!, 3600);
    if (data?.signedUrl) slipUrls.set(r.id, data.signedUrl);
  }));
  const usage = new Map<string, number>();
  if (tab === "businesses" || tab === "expiring") {
    await Promise.all(businesses.slice(0, 200).map(async (b) => {
      const { data } = await db.rpc("month_usage", { p_business: b.id });
      usage.set(b.id, Number(data ?? 0));
    }));
  }
  const soon = pro.filter((b) => b.plan_until && new Date(b.plan_until).getTime() - Date.now() < 10 * 86400_000).sort((a, b) => a.plan_until!.localeCompare(b.plan_until!));
  const wa = (b: Biz, text: string) => {
    const n = (b.whatsapp || b.phone || "").replace(/\D/g, "").replace(/^0/, "94");
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
  };

  const TABS: [string, string][] = [["payments", `💳 Payments${pending.length ? ` · ${pending.length}` : ""}`], ["businesses", "🏪 Businesses"], ["expiring", `⏰ Expiring${soon.length ? ` · ${soon.length}` : ""}`], ["bank", "🏦 Bank details"]];
  const PlanTag = ({ b }: { b: Biz }) => {
    const p = effectivePlan(b);
    return <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${p === "free" ? "bg-black/5 dark:bg-white/10 text-muted" : "bg-brand/15 text-brand"}`}>{p.toUpperCase()}</span>;
  };
  const PlanForm = ({ b }: { b: Biz }) => (
    <form action={setPlan} className="flex gap-1.5">
      <input type="hidden" name="id" value={b.id} />
      <select name="plan" className="input h-9 text-xs w-32" defaultValue="pro1"><option value="pro1">+1 month Pro</option><option value="pro12">+12 months Pro</option><option value="free">Set Free</option></select>
      <button className="btn-ghost h-9 text-xs px-3">Set</button>
    </form>
  );

  return (
    <>
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display font-bold text-2xl">NopeQ <span className="text-brand">Admin</span></h1>
          <span className="text-sm text-muted">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Colombo" })}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[[String(businesses.length), "Businesses"], [String(pro.length), "On Pro"], [String(pending.length), "Waiting for activation"], [formatMoney(revenue, "LKR"), "Approved this month"]].map(([v, l]) => (
            <div key={l} className="card p-4"><div className="font-display font-bold text-2xl">{v}</div><div className="text-xs text-muted font-semibold">{l}</div></div>
          ))}
        </div>
        <div className="flex gap-2 mt-5 overflow-x-auto">{TABS.map(([k, l]) => <Link key={k} href={`?tab=${k}`} className={`chip whitespace-nowrap ${tab === k ? "chip-on" : ""}`}>{l}</Link>)}</div>

        {tab === "payments" && (
          <div className="space-y-6 mt-5">
            <section>
              <h2 className="font-display font-bold text-lg mb-2">Payments to check</h2>
              {pending.length === 0 && <div className="card p-6 text-muted text-sm">Nothing to check 🎉</div>}
              <div className="space-y-2">
                {pending.map((r) => {
                  const b = byId.get(r.business_id);
                  const url = slipUrls.get(r.id);
                  return (
                    <div key={r.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="w-20 h-24 rounded-xl overflow-hidden bg-black/10 shrink-0 block">{url ? <img src={url} alt="slip" className="size-full object-cover" /> : null}</a>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold">{b?.name ?? "—"} <span className="text-muted font-normal text-sm">/{b?.slug}</span></div>
                        <div className="text-sm text-muted">{b?.address ?? ""}</div>
                        <div className="text-sm mt-1">Pro · {r.months === 12 ? "12 months" : "1 month"} · <b>{formatMoney(Number(r.amount), r.currency)}</b> · <b className="text-brand">{r.reference}</b> · <span className="text-muted">{ago(r.created_at)}</span></div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <form action={approvePayment.bind(null, r.id)}><button className="btn h-10 bg-green-600 text-sm">✓ Activate</button></form>
                        <form action={rejectPayment} className="flex gap-1.5">
                          <input type="hidden" name="id" value={r.id} />
                          <input name="note" className="input h-10 text-sm w-40" placeholder="Reason (optional)" maxLength={200} />
                          <button className="btn-ghost h-10 text-sm text-red-500">Reject</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            {noSlip.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-lg mb-2">Reference made, no slip yet</h2>
                <div className="card divide-y divide-[var(--line)]">
                  {noSlip.map((r) => <div key={r.id} className="p-3 text-sm flex justify-between gap-3"><span><b>{byId.get(r.business_id)?.name}</b> · {r.reference}</span><span className="text-muted">{formatMoney(Number(r.amount), r.currency)} · {ago(r.created_at)}</span></div>)}
                </div>
              </section>
            )}
            {decided.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-lg mb-2">Recent decisions</h2>
                <div className="card divide-y divide-[var(--line)]">
                  {decided.map((r) => <div key={r.id} className="p-3 text-sm flex justify-between gap-3"><span><b>{byId.get(r.business_id)?.name}</b> · {r.reference} · {formatMoney(Number(r.amount), r.currency)}</span><span className={r.status === "approved" ? "text-green-600 dark:text-green-400 font-semibold" : "text-red-500 font-semibold"}>{r.status}{r.admin_note ? ` · ${r.admin_note}` : ""}</span></div>)}
                </div>
              </section>
            )}
          </div>
        )}

        {(tab === "businesses" || tab === "expiring") && (
          <div className="card mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-muted">{["Business", "Type", "Plan", "This month", "Pro until", ""].map((h) => <th key={h} className="p-3 font-bold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--line)]">
                {(tab === "expiring" ? soon : businesses).map((b) => {
                  const u = usage.get(b.id) ?? 0;
                  const free = effectivePlan(b) === "free";
                  const days = b.plan_until ? Math.ceil((new Date(b.plan_until).getTime() - Date.now()) / 86400_000) : null;
                  const remind = wa(b, `Hi! Your NopeQ Pro for ${b.name} ends on ${b.plan_until ? fmtDate(b.plan_until) : ""}. Renew from Dashboard → Settings → Plan to keep unlimited bookings and your app icon. — Ravion Studio`);
                  const nudge = wa(b, `Hi! ${b.name} has used ${u} of ${FREE_LIMIT} free bookings this month on NopeQ. Upgrade to Pro for unlimited bookings + your logo as the app icon: Dashboard → Settings → Plan. — Ravion Studio`);
                  return (
                    <tr key={b.id}>
                      <td className="p-3"><a href={`/${b.slug}`} target="_blank" className="font-semibold hover:text-brand">{b.name}</a><div className="text-xs text-muted">/{b.slug} · since {fmtDate(b.created_at)}</div></td>
                      <td className="p-3 whitespace-nowrap">{getKind(b.type).icon} {getKind(b.type).en}</td>
                      <td className="p-3"><PlanTag b={b} /></td>
                      <td className="p-3 whitespace-nowrap">{free ? `${u} / ${FREE_LIMIT}` : u}{free && u >= 40 && <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">{u >= FREE_LIMIT ? "full" : "near limit"}</span>}</td>
                      <td className="p-3 whitespace-nowrap">{b.plan_until && !free ? <>{fmtDate(b.plan_until)}{days !== null && days <= 10 && <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">{days} d</span>}</> : "—"}</td>
                      <td className="p-3"><div className="flex gap-1.5 items-center justify-end">
                        {!free && days !== null && days <= 10 && remind && <a href={remind} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9 text-xs px-3">💬 Remind</a>}
                        {free && u >= 40 && nudge && <a href={nudge} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9 text-xs px-3">💬 Offer Pro</a>}
                        <PlanForm b={b} />
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tab === "expiring" && soon.length === 0 && <div className="p-6 text-sm text-muted">No Pro plans end in the next 10 days.</div>}
          </div>
        )}

        {tab === "bank" && (
          <form action={saveBank} className="card p-6 mt-5 max-w-xl space-y-3">
            <h2 className="font-display font-bold text-lg">Bank details shown on the payment page</h2>
            {[["account_name", "Account name"], ["bank", "Bank"], ["branch", "Branch"], ["account_no", "Account number"], ["note", "Note (optional) · e.g. 'WhatsApp the slip to 07x… if upload fails'"]].map(([k, l]) => (
              <div key={k}><label className="label" htmlFor={k}>{l}</label><input id={k} name={k} className="input" maxLength={120} defaultValue={(bank.data as Record<string, string | null> | null)?.[k] ?? ""} /></div>
            ))}
            <button className="btn">Save</button>
          </form>
        )}
        <p className="text-xs text-muted mt-6">When Pro ends and isn&apos;t renewed, the business goes back to Free automatically (nothing is deleted).</p>
      </div>
    </>
  );
}
