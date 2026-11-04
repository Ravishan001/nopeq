import Link from "next/link";
import { BOOKING_SELECT, BOOKING_SELECT_LEGACY, BookingRow, type BookingRowData } from "@/components/BookingRow";
import { requireBusiness } from "@/lib/business";
import { formatMoney } from "@/lib/countries";
import { getLang, getT } from "@/lib/lang";
import { dayRange, minutesIn, todayIn } from "@/lib/time";

export const metadata = { title: "Bookings" };

const dayKey = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function Bookings({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase, business } = await requireBusiness();
  const { t } = await getT();
  const lang = await getLang();
  const si = lang === "si";
  const tz = business.timezone;
  const { view = "upcoming" } = await searchParams;
  const today = todayIn(tz);
  const tomorrow = todayIn(tz, 1);
  const now = new Date();

  const run = (cols: string) => {
    let q = supabase.from("bookings").select(cols).eq("business_id", business.id);
    if (view === "past") q = q.lt("starts_at", now.toISOString()).order("starts_at", { ascending: false });
    else if (view === "today") { const r = dayRange(today, tz); q = q.gte("starts_at", r.from).lte("starts_at", r.to).order("starts_at"); }
    else q = q.gte("ends_at", new Date(now.getTime() - 30 * 60_000).toISOString()).neq("status", "cancelled").order("starts_at");
    return q.limit(200);
  };
  let { data, error } = await run(BOOKING_SELECT);
  if (error) {
    console.error("bookings page:", error.message);
    ({ data, error } = await run(BOOKING_SELECT_LEGACY));
  }
  const rows = (data ?? []) as unknown as BookingRowData[];

  // stats: next 7 days
  const weekEnd = new Date(now.getTime() + 7 * 86400_000).toISOString();
  const { data: week } = await supabase.from("bookings").select("starts_at, status, services(price)")
    .eq("business_id", business.id).eq("status", "confirmed").gte("starts_at", now.toISOString()).lt("starts_at", weekEnd);
  const weekRows = (week ?? []) as unknown as { services: { price: number } | null }[];
  const expected = weekRows.reduce((s, r) => s + Number(r.services?.price ?? 0), 0);
  const requests = rows.filter((r) => r.request_status === "pending").length;
  const short = (n: number) => (n >= 10000 ? `${Math.round(n / 100) / 10}k` : n.toLocaleString("en"));

  // group by day
  const groups = new Map<string, BookingRowData[]>();
  for (const r of rows) {
    const k = dayKey(r.starts_at, tz);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const tabs: [string, string][] = [["upcoming", si ? "ඉදිරියට" : "Upcoming"], ["today", si ? "අද" : "Today"], ["past", si ? "පහු වෙච්ච" : "History"]];

  return (
    <div className="max-w-3xl">
      <div className="flex p-1 rounded-2xl bg-card border border-line">
        {tabs.map(([v, l]) => (
          <Link key={v} href={`?view=${v}`} className={`flex-1 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition ${view === v ? "bg-brand text-white shadow-md shadow-brand/30" : "text-muted hover:text-fg"}`}>{l}</Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          [String(weekRows.length), si ? "මේ සතියේ" : "Next 7 days", ""],
          [formatMoney(0, business.currency).replace(/0(\.0+)?/, "") + short(expected), si ? "බලාපොරොත්තු" : "Expected", ""],
          [String(requests), si ? "Requests" : "Requests", requests ? "text-amber-500" : ""],
        ].map(([v, l, c]) => (
          <div key={l} className="card px-3 py-2.5">
            <div className={`font-display font-bold text-xl leading-tight truncate ${c}`}>{v}</div>
            <div className="text-[11px] font-semibold text-muted">{l}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-muted mt-6">{t("no_bookings")}</div>
      ) : (
        [...groups.entries()].map(([key, list]) => (
          <section key={key} className="mt-6">
            <div className="flex items-baseline gap-2 mb-3 px-1">
              <h2 className="font-display font-bold text-lg">{key === today ? (si ? "අද" : "Today") : key === tomorrow ? (si ? "හෙට" : "Tomorrow") : dayLabel(key)}</h2>
              {(key === today || key === tomorrow) && <span className="text-sm text-muted font-semibold">{dayLabel(key)}</span>}
              <span className="ml-auto text-xs font-bold text-muted rounded-full border border-line px-2.5 py-0.5">{list.length} {list.length === 1 ? "booking" : "bookings"}</span>
            </div>
            {list.map((b, i) => {
              const prev = list[i - 1];
              const gap = view !== "past" && prev?.ends_at ? (new Date(b.starts_at).getTime() - new Date(prev.ends_at).getTime()) / 60000 : 0;
              return (
                <div key={b.id}>
                  {gap >= 30 && (
                    <div className="flex gap-2 sm:gap-3 items-center mb-3">
                      <div className="w-12 sm:w-14 shrink-0 text-right text-[10px] text-muted font-semibold leading-tight">
                        {formatHM(minutesIn(prev!.ends_at!, tz))}<br />– {formatHM(minutesIn(b.starts_at, tz))}
                      </div>
                      <div className="relative w-3.5 shrink-0 self-stretch"><div className="absolute left-1.5 inset-y-0 w-0.5 bg-[var(--line)]" /></div>
                      <div className="flex-1 rounded-2xl border-[1.5px] border-dashed border-line px-3 py-2 text-xs font-semibold text-muted">
                        {si ? "හිස්" : "Free"} · {gap >= 60 ? `${Math.floor(gap / 60)}h${gap % 60 ? ` ${gap % 60}m` : ""}` : `${gap} min`}
                      </div>
                    </div>
                  )}
                  <BookingRow b={b} lang={lang} t={t} tz={tz} currency={business.currency} last={i === list.length - 1} />
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}

function formatHM(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
}
