import Link from "next/link";
import { PosterMaker } from "@/components/PosterMaker";
import { requireBusiness } from "@/lib/business";
import { getLang } from "@/lib/lang";
import { isPro } from "@/lib/plan";
import { siteUrl } from "@/lib/site";
import { getKind } from "@/lib/templates";

export const metadata = { title: "QR poster" };
const fmt = (hhmm: string) => { const [h, m] = hhmm.slice(0, 5).split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };
const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Poster() {
  const { supabase, business } = await requireBusiness();
  const si = (await getLang()) === "si";
  const kind = getKind(business.type);
  const { data: hrs } = await supabase.from("business_hours").select("weekday, is_open, open_time, close_time").eq("business_id", business.id);
  const open = (hrs ?? []).filter((h) => h.is_open);
  // "Open Mon–Sun · 9 AM – 8 PM" when every open day has the same hours
  let hours: string | null = null;
  if (open.length && open.every((h) => h.open_time === open[0].open_time && h.close_time === open[0].close_time)) {
    const closed = [0, 1, 2, 3, 4, 5, 6].filter((w) => !open.some((h) => h.weekday === w));
    hours = `${closed.length ? `Open daily except ${closed.map((w) => D[w]).join(", ")}` : "Open every day"} · ${fmt(open[0].open_time)} – ${fmt(open[0].close_time)}`;
  }
  const pro = isPro(business);
  const url = `${await siteUrl()}/${business.slug}`;
  const tagline = [kind.en, business.address].filter(Boolean).join(" · ").slice(0, 60);
  return (
    <div className="pb-16">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display font-bold text-2xl">🖨️ {si ? "QR poster එක" : "QR poster"}</h1>
          <p className="text-sm text-muted">{si ? "ලෑස්තියට හැදිලා තියෙන්නේ. Style එක තෝරලා download / print කරන්න." : "Ready-made for your shop front — pick a style, then download or print."}</p>
        </div>
        <Link href="/dashboard" className="btn-ghost h-10 text-sm">← {si ? "Dashboard" : "Dashboard"}</Link>
      </div>
      <PosterMaker p={{ url, name: business.name, slug: business.slug, icon: kind.icon, logo: business.logo_url, tagline,
        color: (pro && business.brand_color) || "#F0521F", branding: !(pro && business.hide_branding), hours, si, orders: business.mode === "orders" }} />
    </div>
  );
}
