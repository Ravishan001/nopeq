import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, getCountry } from "@/lib/countries";

export const metadata = { title: "Order", robots: { index: false } };

const STEPS = ["new", "confirmed", "making", "ready", "done"] as const;
const LABEL: Record<string, [string, string]> = {
  new: ["ලැබුණා", "Received"], confirmed: ["Confirm කළා", "Confirmed"], making: ["හදනවා", "Making"],
  ready: ["ලෑස්තියි", "Ready"], done: ["ඉවරයි", "Done"], cancelled: ["Cancel කළා", "Cancelled"],
};

export default async function OrderStatus({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24}$/.test(token)) notFound();
  const { lang } = await getT();
  const si = lang === "si";
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_order", { p_token: token });
  const o = data?.[0];
  if (!o) notFound();
  const isNew = (await searchParams).new === "1";
  const money = (n: number) => formatMoney(Number(n), o.currency, si ? "si-LK" : "en");
  const day = new Date(`${String(o.due_date).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const cancelled = o.status === "cancelled";
  const at = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const wa = (o.whatsapp || o.phone || "").replace(/\D/g, "").replace(/^0/, getCountry(o.country).dial);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="card p-6 text-center">
          <div className={`size-20 rounded-full mx-auto flex items-center justify-center text-4xl ${cancelled ? "bg-black/5 dark:bg-white/10" : "bg-green-100 text-green-600 dark:bg-green-900/40"}`}>{cancelled ? "✕" : "✓"}</div>
          <h1 className="font-display font-bold text-2xl mt-4">{cancelled ? (si ? "Order එක cancel කළා" : "Order cancelled") : isNew ? (si ? "Order එක ලැබුණා!" : "Order received!") : (si ? "ඔයාගේ order එක" : "Your order")}</h1>
          {isNew && !cancelled && <p className="text-sm text-muted mt-2">{si ? "Shop එකෙන් ඉක්මනින් confirm කරයි. මේ page එක save කරගන්න." : "The shop will confirm it soon. Save this page to check the status."}</p>}

          {!cancelled && (
            <div className="flex gap-1 mt-6">
              {STEPS.map((s, i) => (
                <div key={s} className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${i < at ? "bg-green-500/15 text-green-600 dark:text-green-400" : i === at ? "bg-brand text-white" : "bg-black/5 dark:bg-white/5 text-muted"}`}>
                  {i < at ? "✓ " : ""}{LABEL[s][si ? 0 : 1]}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-line mt-6 text-left divide-y divide-[var(--line)]">
            <div className="p-4 font-display font-bold text-lg">{o.business_name}</div>
            {[
              ["🛍️", [o.item_name, o.size, o.flavour].filter(Boolean).join(" · ")],
              o.message && ["✍️", `“${o.message}”`],
              ["🗓", `${day}${o.time_pref ? ` · ${o.time_pref}` : ""}`],
              ["📦", o.fulfilment === "delivery" ? "🛵 Delivery" : "🏪 Pickup"],
              ["💰", `${money(o.total)}${Number(o.advance) > 0 ? ` · ${si ? "advance" : "advance"} ${money(o.advance)}` : ""}`],
              ["👤", o.customer_name],
            ].filter(Boolean).map((r) => {
              const [i, v] = r as [string, string];
              return <div key={i} className="px-4 py-3 flex gap-3 items-center"><span className="w-6 text-center">{i}</span><span className={i === "👤" ? "text-muted" : "font-semibold"}>{v}</span></div>;
            })}
          </div>

          <div className="grid gap-2 mt-6">
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn">💬 {si ? "Shop එකට WhatsApp කරන්න" : "WhatsApp the shop"}</a>}
            <Link href={`/${o.slug}`} className="btn-ghost">{si ? "← Shop එකට ආපහු" : "← Back to shop"}</Link>
          </div>
        </div>
      </main>
    </>
  );
}
