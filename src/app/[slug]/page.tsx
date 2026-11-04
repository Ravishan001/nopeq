import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { Toggles } from "@/components/Toggles";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { RESERVED_SLUGS } from "@/lib/templates";
import { getCountry } from "@/lib/countries";
import { WEEKDAYS } from "@/lib/i18n";
import { todayIn, weekdayOf } from "@/lib/time";
import { BookingFlow } from "./BookingFlow";

async function load(slug: string) {
  if (RESERVED_SLUGS.has(slug) || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data: b } = await supabase.from("businesses")
    .select("id, slug, name, sections, country, currency, timezone, logo_url, cover_url, phone, whatsapp, address, maps_url, facebook, instagram, tiktok")
    .eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!b) return null;
  const [services, staff, branches, hours] = await Promise.all([
    supabase.from("services").select("id, name, section, price, duration_min").eq("business_id", b.id).eq("active", true).order("sort"),
    supabase.from("staff").select("id, name").eq("business_id", b.id).eq("active", true).order("created_at"),
    supabase.from("branches").select("id, name").eq("business_id", b.id).order("created_at"),
    supabase.from("business_hours").select("weekday, is_open, open_time, close_time").eq("business_id", b.id),
  ]);
  return { b, services: services.data ?? [], staff: staff.data ?? [], branches: branches.data ?? [], hours: hours.data ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Not found" };
  return {
    title: d.b.name,
    description: `${d.b.name} — book online in seconds. No login needed.`,
    openGraph: { title: d.b.name, images: d.b.cover_url ? [d.b.cover_url] : undefined },
    icons: d.b.logo_url ? { icon: d.b.logo_url, apple: d.b.logo_url } : undefined,
  };
}

const fmt12 = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

const Icon = {
  pin: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  phone: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>,
  wa: <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.4-.3z" /></svg>,
  ig: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>,
  fb: <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8z" /></svg>,
  tt: <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M16.5 3a5 5 0 0 0 4 4v3a8 8 0 0 1-4-1.2V15a6 6 0 1 1-6-6h.5v3.1a3 3 0 1 0 2.5 2.9V3z" /></svg>,
  clock: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
};

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { t, lang } = await getT();
  const { b } = d;
  const si = lang === "si";
  const dial = getCountry(b.country).dial;
  const wa = (b.whatsapp || b.phone || "").replace(/\D/g, "").replace(/^0/, dial);

  // open now?
  const today = todayIn(b.timezone);
  const dow = weekdayOf(today);
  const nowHM = new Intl.DateTimeFormat("en-GB", { timeZone: b.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const h = d.hours.find((x) => x.weekday === dow);
  const openNow = !!h?.is_open && nowHM >= h.open_time.slice(0, 5) && nowHM < h.close_time.slice(0, 5);
  const status = openNow
    ? { on: true, text: si ? `දැන් open · ${fmt12(h!.close_time)} වෙනකම්` : `Open now · until ${fmt12(h!.close_time)}` }
    : { on: false, text: si ? "දැන් වහලා" : "Closed now" };

  const actions = [
    wa && { label: "WhatsApp", href: `https://wa.me/${wa}`, icon: Icon.wa },
    b.phone && { label: si ? "Call" : "Call", href: `tel:${b.phone}`, icon: Icon.phone },
    b.maps_url && { label: si ? "Map" : "Directions", href: b.maps_url, icon: Icon.pin },
    b.instagram && { label: "Instagram", href: b.instagram, icon: Icon.ig },
    b.facebook && { label: "Facebook", href: b.facebook, icon: Icon.fb },
    b.tiktok && { label: "TikTok", href: b.tiktok, icon: Icon.tt },
  ].filter(Boolean) as { label: string; href: string; icon: React.ReactNode }[];

  const order = [1, 2, 3, 4, 5, 6, 0];
  const InfoCard = (
    <div className="card p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2 font-display font-bold">{Icon.clock}{si ? "Open වෙලාවල්" : "Opening hours"}</div>
        <ul className="mt-3 space-y-1.5 text-sm">
          {order.map((w) => {
            const x = d.hours.find((y) => y.weekday === w);
            const isToday = w === dow;
            return (
              <li key={w} className={`flex justify-between rounded-lg px-2.5 py-1.5 ${isToday ? "bg-soft font-semibold" : ""}`}>
                <span>{WEEKDAYS[lang][w]}{isToday ? (si ? " · අද" : " · Today") : ""}</span>
                <span className={x?.is_open ? "" : "text-muted"}>{x?.is_open ? `${fmt12(x.open_time)} – ${fmt12(x.close_time)}` : si ? "වහලා" : "Closed"}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {(b.address || d.branches.length > 0) && (
        <div className="border-t border-line pt-4">
          <div className="flex items-center gap-2 font-display font-bold">{Icon.pin}{si ? "ලිපිනය" : "Location"}</div>
          {d.branches.length > 0 && <p className="text-sm mt-2 font-semibold">{d.branches.map((x) => x.name).join(" · ")}</p>}
          {b.address && <p className="text-sm text-muted mt-1">{b.address}</p>}
          {b.maps_url && <a href={b.maps_url} target="_blank" rel="noopener noreferrer" className="btn-ghost h-10 w-full mt-3 text-sm">{si ? "Google Maps එකෙන් බලන්න" : "Open in Google Maps"} ↗</a>}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh pb-28">
      {/* cover */}
      <div className="relative h-56 sm:h-72 bg-gradient-to-br from-ink via-[#1E2541] to-[#3a2a4a] overflow-hidden">
        {b.cover_url && <img src={b.cover_url} alt="" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-black/20 to-black/30" />
        <div className="absolute top-0 inset-x-0">
          <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-end"><Toggles /></div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4">
        {/* profile */}
        <section className="relative z-10 -mt-20 sm:-mt-24 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="size-28 sm:size-32 rounded-3xl border-4 border-[var(--bg)] bg-card overflow-hidden flex items-center justify-center text-4xl shrink-0 shadow-xl">
            {b.logo_url ? <img src={b.logo_url} alt={b.name} className="size-full object-cover" /> : "✂️"}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${status.on ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-black/5 dark:bg-white/10 text-muted"}`}>
              <span className={`size-2 rounded-full ${status.on ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              {status.text}
            </div>
            <h1 className="font-display font-bold text-3xl sm:text-5xl tracking-tight mt-2 leading-tight">{b.name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {b.sections.map((s: string) => <span key={s} className="text-xs font-semibold rounded-full border border-line px-2.5 py-1 text-muted">{s}</span>)}
              {d.branches.length > 0 && <span className="text-xs font-semibold rounded-full border border-line px-2.5 py-1 text-muted">📍 {d.branches.map((x) => x.name).join(" · ")}</span>}
            </div>
          </div>
        </section>

        {actions.length > 0 && (
          <div className="flex gap-2 mt-5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            {actions.map((a) => (
              <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-2 h-11 px-4 rounded-2xl bg-card border border-line font-semibold text-sm hover:border-brand hover:text-brand transition">
                {a.icon}{a.label}
              </a>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_340px] gap-8 mt-10">
          <div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight">{t("book_title")}</h2>
            <p className="text-muted mt-1">{t("no_login")}</p>
            <div className="mt-6">
              {d.services.length ? (
                <BookingFlow businessId={b.id} sections={b.sections} services={d.services} staff={d.staff} branches={d.branches} currency={b.currency} timezone={b.timezone} dial={dial} />
              ) : (
                <div className="card p-8 text-center text-muted">—</div>
              )}
            </div>
          </div>
          <aside className="lg:sticky lg:top-6 h-fit">{InfoCard}</aside>
        </div>

        <div className="mt-16 flex flex-col items-center gap-1 text-xs text-muted">
          <Link href="/" className="opacity-70 hover:opacity-100"><Wordmark size={18} /></Link>
          <span>powered by Ravion Studio</span>
        </div>
      </main>
    </div>
  );
}
