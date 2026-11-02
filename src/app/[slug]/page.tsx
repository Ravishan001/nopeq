import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoweredBy } from "@/components/Header";
import { Wordmark } from "@/components/Logo";
import { Toggles } from "@/components/Toggles";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { RESERVED_SLUGS } from "@/lib/templates";
import { BookingFlow } from "./BookingFlow";
import { getCountry } from "@/lib/countries";
import Link from "next/link";

async function load(slug: string) {
  if (RESERVED_SLUGS.has(slug) || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data: b } = await supabase.from("businesses")
    .select("id, slug, name, sections, country, currency, timezone, logo_url, cover_url, phone, whatsapp, address, maps_url, facebook, instagram, tiktok")
    .eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!b) return null;
  const [services, staff, branches] = await Promise.all([
    supabase.from("services").select("id, name, section, price, duration_min").eq("business_id", b.id).eq("active", true).order("sort"),
    supabase.from("staff").select("id, name").eq("business_id", b.id).eq("active", true).order("created_at"),
    supabase.from("branches").select("id, name").eq("business_id", b.id).order("created_at"),
  ]);
  return { b, services: services.data ?? [], staff: staff.data ?? [], branches: branches.data ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Not found" };
  return {
    title: d.b.name,
    description: `${d.b.name} — book online. No login needed.`,
    openGraph: { title: d.b.name, images: d.b.cover_url ? [d.b.cover_url] : undefined },
    icons: d.b.logo_url ? { icon: d.b.logo_url, apple: d.b.logo_url } : undefined,
  };
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { t } = await getT();
  const { b } = d;
  const dial = getCountry(b.country).dial;
  const wa = (b.whatsapp || b.phone || "").replace(/\D/g, "").replace(/^0/, dial);
  const links = [
    b.maps_url && ["📍 Map", b.maps_url],
    wa && ["💬 WhatsApp", `https://wa.me/${wa}`],
    b.phone && ["📞 Call", `tel:${b.phone}`],
    b.facebook && ["Facebook", b.facebook],
    b.instagram && ["Instagram", b.instagram],
    b.tiktok && ["TikTok", b.tiktok],
  ].filter(Boolean) as [string, string][];

  return (
    <>
      <div className="relative">
        <div className="h-40 sm:h-56 bg-gradient-to-br from-ink to-[#1E2541] overflow-hidden">
          {b.cover_url && <img src={b.cover_url} alt="" className="size-full object-cover opacity-90" />}
        </div>
        <div className="absolute top-3 right-3"><Toggles /></div>
      </div>
      <main className="mx-auto max-w-3xl px-4">
        <div className="relative z-10 -mt-12 flex items-end gap-4">
          <div className="size-24 rounded-full border-4 border-[var(--bg)] bg-card overflow-hidden flex items-center justify-center text-3xl shrink-0 shadow-lg">
            {b.logo_url ? <img src={b.logo_url} alt={b.name} className="size-full object-cover" /> : "✂️"}
          </div>
          <div className="pb-1 min-w-0">
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight truncate">{b.name}</h1>
            {d.branches.length > 0 && <p className="text-muted text-sm">{d.branches.map((x) => x.name).join(" · ")}</p>}
          </div>
        </div>
        {b.address && <p className="text-sm text-muted mt-3">{b.address}</p>}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {links.map(([l, href]) => <a key={l} href={href} target="_blank" rel="noopener noreferrer" className="chip text-xs">{l}</a>)}
          </div>
        )}
        <h2 className="font-display font-bold text-3xl tracking-tight mt-10 mb-6">{t("book_title")}</h2>
        {d.services.length ? (
          <BookingFlow businessId={b.id} sections={b.sections} services={d.services} staff={d.staff} branches={d.branches} currency={b.currency} timezone={b.timezone} dial={dial} />
        ) : (
          <p className="text-muted">—</p>
        )}
        <div className="mt-12 flex justify-center">
          <Link href="/" className="opacity-60 hover:opacity-100"><Wordmark size={18} /></Link>
        </div>
      </main>
      <PoweredBy />
    </>
  );
}
