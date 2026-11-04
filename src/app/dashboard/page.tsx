import Link from "next/link";
import { LinkCard, QrCard, ShareButton } from "@/components/ShareSheet";
import { PushToggle } from "@/components/PushToggle";
import { NotifyStatus } from "@/components/NotifyStatus";
import { SlotBoard } from "@/components/SlotBoard";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";
import { siteUrl } from "@/lib/site";
import { ampm, minutesIn, todayIn } from "@/lib/time";
import type { TKey } from "@/lib/i18n";
import { getBoard } from "./board-actions";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; debug?: string }> }) {
  const { supabase, business } = await requireBusiness();
  const { t, lang } = await getT();
  const si = lang === "si";
  const { welcome, debug } = await searchParams;

  const [svc, stf, hrs, board] = await Promise.all([
    supabase.from("services").select("id, name, duration_min, price").eq("business_id", business.id).eq("active", true).order("sort"),
    supabase.from("staff").select("id, name").eq("business_id", business.id).eq("active", true).order("created_at"),
    supabase.from("business_hours").select("weekday", { count: "exact", head: true }).eq("business_id", business.id).eq("is_open", true),
    getBoard(todayIn(business.timezone)),
  ]);
  const services = (svc.data ?? []).map((s) => ({ ...s, price: Number(s.price) }));
  const staff = stf.data ?? [];

  const checklist: { key: TKey; done: boolean; href: string; locked?: boolean }[] = [
    { key: "cl_name", done: true, href: "/dashboard/settings" },
    { key: "cl_services", done: services.length > 0, href: "/dashboard/settings?tab=services" },
    { key: "cl_staff", done: staff.length > 0, href: "/dashboard/settings?tab=staff" },
    { key: "cl_hours", done: (hrs.count ?? 0) > 0, href: "/dashboard/settings?tab=hours" },
    { key: "cl_logo", done: !!business.logo_url, href: "/dashboard/settings#media" },
    { key: "cl_cover", done: !!business.cover_url, href: "/dashboard/settings#media" },
    { key: "cl_location", done: !!(business.address || business.maps_url), href: "/dashboard/settings#contact" },
    { key: "cl_social", done: !!(business.facebook || business.instagram || business.tiktok), href: "/dashboard/settings#contact" },
    { key: "cl_whatsapp", done: false, href: "#", locked: business.plan !== "ai" },
  ];
  const countable = checklist.filter((c) => !c.locked);
  const done = countable.filter((c) => c.done).length;
  const pct = Math.round((done / countable.length) * 100);
  const url = `${await siteUrl()}/${business.slug}`;

  // "Next up" for the sidebar
  const nowMin = minutesIn(new Date(), business.timezone);
  const next = board.items
    .filter((i) => (i.kind === "booking" && i.status === "confirmed") || i.kind === "request")
    .filter((i) => minutesIn(i.ends_at, business.timezone) > nowMin)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4);

  const BizCard = (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-black/5 dark:bg-white/10 overflow-hidden flex items-center justify-center text-xl shrink-0">
          {business.logo_url ? <img src={business.logo_url} alt="" className="size-full object-cover" /> : "✂️"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold leading-tight truncate">{business.name}</div>
          <div className="text-xs text-muted truncate">/{business.slug}{pct === 100 ? " · ✓ Setup complete" : ""}</div>
        </div>
        <div className="flex gap-1.5 shrink-0 lg:hidden"><ShareButton url={url} name={business.name} /></div>
        <a href={`/${business.slug}`} target="_blank" className="btn h-10 px-3 text-sm shrink-0">{si ? "බලන්න" : "View"} ↗</a>
      </div>
      {pct < 100 && (
        <details className="mt-3 group" open={!!welcome}>
          <summary className="cursor-pointer list-none">
            <div className="flex justify-between text-sm font-bold"><span>{t("setup_done", { p: pct })}</span><span className="text-brand">{done}/{countable.length} ▾</span></div>
            <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 mt-2 overflow-hidden"><div className="h-full bg-gradient-to-r from-brand-glow to-brand rounded-full" style={{ width: `${pct}%` }} /></div>
          </summary>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {checklist.map((c) => (
              <li key={c.key}>
                <Link href={c.locked ? "#" : c.href} className={`flex items-center gap-3 py-2.5 text-sm ${c.locked ? "opacity-50 pointer-events-none" : ""}`}>
                  <span className={`size-5 rounded-md flex items-center justify-center text-xs shrink-0 ${c.done ? "bg-green-600 text-white" : "border-2 border-line"}`}>{c.done ? "✓" : c.locked ? "🔒" : ""}</span>
                  <span className={c.done ? "text-muted" : "font-semibold"}>{t(c.key)}</span>
                  {!c.done && !c.locked && <span className="ml-auto text-brand font-bold text-xs">{t("add")} →</span>}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );

  const Alerts = (
    <section className="card p-4 space-y-4">
      <PushToggle />
      {debug && <NotifyStatus lang={lang} />}
    </section>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 pb-20">
      <div className="min-w-0 space-y-4">
        {welcome && (
          <div className="card p-4 bg-soft border-brand">
            <div className="font-display font-bold text-lg">🎉 {business.name}</div>
            <div className="text-muted text-sm">Page එක live! / Your page is live!</div>
          </div>
        )}
        <div className="lg:hidden">{BizCard}</div>
        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted mb-2 px-1">{si ? "අද slots" : "Today's slots"}</h2>
          <SlotBoard initial={board} staff={staff} services={services} timezone={business.timezone} currency={business.currency} />
        </div>
        <div className="lg:hidden space-y-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted mt-6 px-1">{si ? "Share සහ alerts" : "Share & alerts"}</h2>
          <LinkCard url={url} name={business.name} />
          {Alerts}
        </div>
      </div>

      <aside className="hidden lg:block space-y-4">
        {BizCard}
        <QrCard url={url} name={business.name} />
        {Alerts}
        <div className="card p-4">
          <div className="font-display font-bold">{si ? "ඊළඟට" : "Next up"}</div>
          {next.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {next.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  <span>{i.kind === "request" ? "🔁" : i.source === "walkin" ? "🚶" : "🟠"}</span>
                  <span className="font-semibold">{ampm(minutesIn(i.starts_at, business.timezone))}</span>
                  <span className="text-muted truncate">· {i.kind === "request" ? (si ? "Change request" : "Change request") : i.title}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted mt-1">{si ? "අද තව bookings නෑ" : "Nothing else today"}</p>}
          <Link href="/dashboard/bookings" className="btn-ghost w-full h-10 text-sm mt-3">{si ? "ඔක්කොම bookings →" : "All bookings →"}</Link>
        </div>
      </aside>
    </div>
  );
}
