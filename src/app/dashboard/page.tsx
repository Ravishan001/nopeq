import Link from "next/link";
import { BOOKING_SELECT, BookingRow, type BookingRowData } from "@/components/BookingRow";
import { ShareCard } from "@/components/ShareCard";
import { PushToggle } from "@/components/PushToggle";
import { NotifyStatus } from "@/components/NotifyStatus";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";
import { siteUrl } from "@/lib/site";
import type { TKey } from "@/lib/i18n";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; debug?: string }> }) {
  const { supabase, business } = await requireBusiness();
  const { t, lang } = await getT();
  const { welcome, debug } = await searchParams;

  const [svc, stf, hrs, upcoming] = await Promise.all([
    supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
    supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
    supabase.from("business_hours").select("weekday", { count: "exact", head: true }).eq("business_id", business.id).eq("is_open", true),
    supabase.from("bookings").select(BOOKING_SELECT).eq("business_id", business.id).eq("status", "confirmed")
      .gte("starts_at", new Date(Date.now() - 3600_000).toISOString()).order("starts_at").limit(10),
  ]);

  const checklist: { key: TKey; done: boolean; href: string; locked?: boolean }[] = [
    { key: "cl_name", done: true, href: "/dashboard/settings" },
    { key: "cl_services", done: (svc.count ?? 0) > 0, href: "/dashboard/settings?tab=services" },
    { key: "cl_staff", done: (stf.count ?? 0) > 0, href: "/dashboard/settings?tab=staff" },
    { key: "cl_hours", done: (hrs.count ?? 0) > 0, href: "/dashboard/settings?tab=hours" },
    { key: "cl_logo", done: !!business.logo_url, href: "/dashboard/settings#media" },
    { key: "cl_cover", done: !!business.cover_url, href: "/dashboard/settings#media" },
    { key: "cl_location", done: !!(business.address || business.maps_url), href: "/dashboard/settings#contact" },
    { key: "cl_social", done: !!(business.facebook || business.instagram || business.tiktok), href: "/dashboard/settings#contact" },
    { key: "cl_whatsapp", done: false, href: "#", locked: business.plan !== "ai" },
  ];
  const countable = checklist.filter((c) => !c.locked);
  const pct = Math.round((countable.filter((c) => c.done).length / countable.length) * 100);
  const url = `${await siteUrl()}/${business.slug}`;

  const Checklist = () => (
    <ul className="mt-3 divide-y divide-[var(--line)]">
      {checklist.map((c) => (
        <li key={c.key}>
          <Link href={c.locked ? "#" : c.href} className={`flex items-center gap-3 py-2.5 text-sm rounded-lg ${c.locked ? "opacity-50 pointer-events-none" : "hover:bg-black/[.03] dark:hover:bg-white/[.03]"}`}>
            <span className={`size-5 rounded-md flex items-center justify-center text-xs shrink-0 ${c.done ? "bg-green-600 text-white" : "border-2 border-line"}`}>{c.done ? "✓" : c.locked ? "🔒" : ""}</span>
            <span className={c.done ? "text-muted" : "font-semibold"}>{t(c.key)}</span>
            {!c.done && !c.locked && <span className="ml-auto text-brand font-bold text-xs">{t("add")} →</span>}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-6 order-2 lg:order-1">
        {welcome && (
          <div className="card p-5 bg-soft border-brand">
            <div className="font-display font-bold text-xl">🎉 {business.name}</div>
            <div className="text-muted mt-1">Page එක live! / Your page is live!</div>
          </div>
        )}
        <ShareCard url={url} />
        <section className="card p-5 space-y-4">
          <PushToggle />
          {debug && <NotifyStatus lang={lang} />}
        </section>
        <section>
          <h2 className="font-display font-bold text-xl mb-3">{t("upcoming")}</h2>
          <div className="space-y-2">
            {(upcoming.data as unknown as BookingRowData[] | null)?.length ? (
              (upcoming.data as unknown as BookingRowData[]).map((b) => <BookingRow key={b.id} b={b} lang={lang} t={t} tz={business.timezone} currency={business.currency} />)
            ) : (
              <div className="card p-8 text-center text-muted">{t("no_bookings")}</div>
            )}
          </div>
        </section>
      </div>

      <aside className="card overflow-hidden h-fit order-1 lg:order-2">
        <div className="relative h-28 bg-gradient-to-br from-ink to-[#2a3358]">
          {business.cover_url && <img src={business.cover_url} alt="" className="absolute inset-0 size-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
        <div className="px-5 pb-5">
          <div className="relative z-10 -mt-10 flex items-end gap-3">
            <div className="size-20 rounded-2xl border-4 border-[var(--card)] bg-card overflow-hidden flex items-center justify-center text-2xl shrink-0 shadow-lg">
              {business.logo_url ? <img src={business.logo_url} alt="" className="size-full object-cover" /> : "✂️"}
            </div>
            <div className="pb-1 min-w-0">
              <div className="font-display font-bold text-lg leading-tight truncate">{business.name}</div>
              <div className="text-xs text-muted truncate">nopeq · /{business.slug}</div>
            </div>
          </div>

          {pct === 100 ? (
            <details className="mt-5 group">
              <summary className="flex items-center gap-3 cursor-pointer list-none rounded-xl bg-green-500/10 text-green-700 dark:text-green-400 px-4 py-3 font-semibold text-sm">
                <span className="size-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs">✓</span>
                Setup complete
                <span className="ml-auto text-xs opacity-70 group-open:rotate-180 transition">▾</span>
              </summary>
              <Checklist />
            </details>
          ) : (
            <>
              <div className="flex justify-between text-sm font-bold mt-5">
                <span>{t("setup_done", { p: pct })}</span>
                <span className="text-brand">{countable.filter((c) => c.done).length}/{countable.length}</span>
              </div>
              <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 mt-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-glow to-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <Checklist />
              {!business.cover_url && <div className="mt-3 text-xs text-muted bg-soft rounded-xl p-3">{t("tip_cover")}</div>}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
