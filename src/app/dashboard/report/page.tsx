import Link from "next/link";
import { requireBusiness } from "@/lib/business";
import { getLang } from "@/lib/lang";
import { formatMoney } from "@/lib/countries";
import { isPro } from "@/lib/plan";
import { zonedToUtc } from "@/lib/time";

export const metadata = { title: "Monthly report" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Bars({ rows, money }: { rows: [string, number, number][]; money?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-sm text-muted">—</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map(([k, n, v]) => (
        <li key={k}>
          <div className="flex justify-between text-sm"><span className="font-semibold truncate">{k}</span><span className="text-muted shrink-0 ml-2">{n}{money && v ? ` · ${money(v)}` : ""}</span></div>
          <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 mt-1 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand-glow to-brand" style={{ width: `${(n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function Report({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { supabase, business } = await requireBusiness();
  const si = (await getLang()) === "si";
  const tz = business.timezone;
  const money = (n: number) => formatMoney(n, business.currency, si ? "si-LK" : "en");

  if (!isPro(business)) {
    return (
      <div className="max-w-xl card p-8 text-center">
        <div className="text-4xl">📊</div>
        <h1 className="font-display font-bold text-2xl mt-2">{si ? "Monthly report" : "Monthly report"}</h1>
        <p className="text-muted mt-2">{si ? "මාසෙට bookings, revenue, හොඳම services, busy දවස් — Pro plan එකෙන්." : "Bookings, revenue, top services and your busiest days — on the Pro plan."}</p>
        <Link href="/dashboard/settings?tab=plan" className="btn mt-5">⭐ {si ? "Pro එකට upgrade" : "Upgrade to Pro"}</Link>
      </div>
    );
  }

  const now = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test((await searchParams).m ?? "") ? (await searchParams).m! : now;
  const [y, mo] = m.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  const from = zonedToUtc(`${m}-01`, "00:00", tz).toISOString();
  const to = zonedToUtc(`${next}-01`, "00:00", tz).toISOString();
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5)) - 1 - i, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; });

  let cards: [string, string][] = [];
  let top: [string, number, number][] = [];
  let staffRows: [string, number, number][] = [];
  let dayRows: [string, number, number][] = [];

  if (business.mode === "orders") {
    const { data } = await supabase.from("orders").select("item_name, total, status, source, due_date").eq("business_id", business.id).gte("due_date", `${m}-01`).lt("due_date", `${next}-01`);
    const rows = (data ?? []) as { item_name: string; total: number; status: string; source: string; due_date: string }[];
    const live = rows.filter((r) => r.status !== "cancelled");
    const revenue = live.reduce((n, r) => n + Number(r.total), 0);
    cards = [[String(live.length), si ? "Orders" : "Orders"], [money(revenue), si ? "Revenue" : "Revenue"], [live.length ? money(revenue / live.length) : "—", si ? "සාමාන්‍ය order එක" : "Average order"], [String(rows.length - live.length), si ? "Cancel කළා" : "Cancelled"]];
    const by = new Map<string, [number, number]>();
    for (const r of live) { const x = by.get(r.item_name) ?? [0, 0]; by.set(r.item_name, [x[0] + 1, x[1] + Number(r.total)]); }
    top = [...by].sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([k, [n, v]]) => [k, n, v]);
    const dow = Array(7).fill(0); for (const r of live) dow[new Date(`${r.due_date}T12:00:00Z`).getUTCDay()]++;
    dayRows = [1, 2, 3, 4, 5, 6, 0].map((d) => [DAYS[d], dow[d], 0]);
  } else {
    const { data } = await supabase.from("bookings").select("starts_at, status, services(name, price), staff:staff!bookings_staff_id_fkey(name)")
      .eq("business_id", business.id).gte("starts_at", from).lt("starts_at", to);
    const rows = (data ?? []) as unknown as { starts_at: string; status: string; services: { name: string; price: number } | null; staff: { name: string } | null }[];
    const done = rows.filter((r) => r.status === "confirmed" || r.status === "completed");
    const revenue = done.reduce((n, r) => n + Number(r.services?.price ?? 0), 0);
    const noShow = rows.filter((r) => r.status === "no_show").length;
    cards = [[String(done.length), si ? "Bookings" : "Bookings"], [money(revenue), si ? "Revenue" : "Revenue"], [String(noShow), si ? "ආවේ නෑ" : "No-shows"], [String(rows.filter((r) => r.status === "cancelled").length), si ? "Cancel කළා" : "Cancelled"]];
    const svc = new Map<string, [number, number]>(), st = new Map<string, [number, number]>();
    for (const r of done) {
      const k = r.services?.name ?? "—", p = Number(r.services?.price ?? 0);
      const a = svc.get(k) ?? [0, 0]; svc.set(k, [a[0] + 1, a[1] + p]);
      if (r.staff) { const b = st.get(r.staff.name) ?? [0, 0]; st.set(r.staff.name, [b[0] + 1, b[1] + p]); }
    }
    top = [...svc].sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([k, [n, v]]) => [k, n, v]);
    staffRows = [...st].sort((a, b) => b[1][0] - a[1][0]).map(([k, [n, v]]) => [k, n, v]);
    const dow = Array(7).fill(0);
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
    for (const r of done) dow[Math.max(0, DAYS.indexOf(wd.format(new Date(r.starts_at))))]++;
    dayRows = [1, 2, 3, 4, 5, 6, 0].map((d) => [DAYS[d], dow[d], 0]);
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display font-bold text-2xl">📊 {MONTHS[mo - 1]} {y}</h1>
        <div className="flex gap-1.5 overflow-x-auto">
          {months.map((k) => <Link key={k} href={`?m=${k}`} className={`chip whitespace-nowrap ${k === m ? "chip-on" : ""}`}>{MONTHS[Number(k.slice(5)) - 1].slice(0, 3)}</Link>)}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(([v, l]) => <div key={l} className="card p-4"><div className="font-display font-bold text-2xl truncate">{v}</div><div className="text-xs text-muted font-semibold">{l}</div></div>)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5"><h2 className="font-display font-bold mb-3">{business.mode === "orders" ? (si ? "හොඳම products" : "Top products") : (si ? "හොඳම services" : "Top services")}</h2><Bars rows={top} money={money} /></div>
        {staffRows.length > 0 && <div className="card p-5"><h2 className="font-display font-bold mb-3">{si ? "Staff" : "Staff"}</h2><Bars rows={staffRows} money={money} /></div>}
        <div className="card p-5"><h2 className="font-display font-bold mb-3">{si ? "Busy දවස්" : "Busiest days"}</h2><Bars rows={dayRows} /></div>
      </div>
      <p className="text-xs text-muted">{si ? "Revenue = service ගාණ (confirmed + came). Cancel / no-show එකතු කරලා නෑ." : "Revenue = service prices of confirmed + completed bookings. Cancelled / no-shows are not counted."}</p>
    </div>
  );
}
