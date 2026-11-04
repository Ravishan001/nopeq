"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLang } from "@/components/I18nProvider";
import { PhotoPicker } from "@/components/PhotoPicker";
import { formatMoney } from "@/lib/countries";
import { readOptions } from "@/lib/templates";
import { todayIn, weekdayOf } from "@/lib/time";
import { getOrderDays, placeOrder, type OrderDay } from "./orders-actions";

export type Product = { id: string; name: string; section: string | null; price: number; description: string | null; image_url: string | null; options: unknown };
type Rules = { dailyLimit: number; leadDays: number; deliveryFee: number | null; advancePct: number };

const GRADS = ["linear-gradient(135deg,#3b1d2a,#5b2338)", "linear-gradient(135deg,#1f2a3b,#24395b)", "linear-gradient(135deg,#2a2a17,#4a3c18)", "linear-gradient(135deg,#1c2e25,#1f4a36)", "linear-gradient(135deg,#2e1f3b,#45245b)"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const prettyDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className={`size-8 rounded-full flex items-center justify-center text-sm font-bold ${done ? "bg-green-600 text-white" : "bg-brand text-white"}`}>{done ? "✓" : n}</span>
        <h3 className="font-display font-bold text-lg">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function OrderFlow({ businessId, kind, icon, sections, products, openDays, rules, currency, timezone, dial, refs }: {
  businessId: string; kind: string; icon: string; sections: string[]; products: Product[]; openDays: number[];
  rules: Rules; currency: string; timezone: string; dial: string; refs: boolean;
}) {
  const si = useLang() === "si";
  const router = useRouter();
  const money = (n: number) => formatMoney(Number(n), currency, si ? "si-LK" : "en");
  const sectionList = sections.filter((s) => products.some((x) => x.section === s));
  const isCake = kind === "cake";

  const [section, setSection] = useState<string | null>(sectionList[0] ?? null);
  const [product, setProduct] = useState<Product | null>(null);
  const opts = useMemo(() => readOptions(product?.options), [product]);
  const [size, setSize] = useState<string | null>(null);
  const [flavour, setFlavour] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [timePref, setTimePref] = useState<"morning" | "afternoon" | "evening" | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [hp, setHp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [days, setDays] = useState<Map<string, OrderDay> | null>(null);
  const [month, setMonth] = useState(0); // 0 = this month, 1 = next
  const dayRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  const today = todayIn(timezone);
  const last = todayIn(timezone, 62);
  const loadDays = () => getOrderDays(businessId, today, last).then((r) => setDays(new Map(r.map((d) => [d.day, d])))).catch(() => setDays(new Map()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDays(); }, [businessId, today]);

  const unit = product ? (opts.sizes.length ? opts.sizes.find((s) => s.label === size)?.price ?? null : Number(product.price)) : null;
  const fee = fulfilment === "delivery" ? rules.deliveryFee ?? 0 : 0;
  const total = unit === null ? null : unit + fee;
  const advance = total === null ? 0 : Math.round((total * rules.advancePct) / 100);
  const optionsDone = !!product && (!opts.sizes.length || !!size) && (!opts.flavours.length || !!flavour);
  const ready = optionsDone && !!due && (fulfilment === "pickup" || address.trim().length > 4) && name.trim().length >= 2 && phone.trim().length >= 6;

  function pick(p: Product) {
    setProduct(p);
    const o = readOptions(p.options);
    setSize(o.sizes.length === 1 ? o.sizes[0].label : null);
    setFlavour(o.flavours.length === 1 ? o.flavours[0] : null);
  }

  type Cell = { date: string; n: number; state: "past" | "soon" | "closed" | "full" | "open"; left: number } | null;
  const calendar = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1 + month, 1));
    const yy = first.getUTCFullYear(), mm = first.getUTCMonth();
    const count = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const lead = todayIn(timezone, rules.leadDays);
    const cells: Cell[] = Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null);
    for (let n = 1; n <= count; n++) {
      const date = `${yy}-${String(mm + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
      const info = days?.get(date);
      const left = rules.dailyLimit - (info?.taken ?? 0);
      const state = date < today || date > last ? "past" : date < lead ? "soon" : !openDays.includes(weekdayOf(date)) || info?.closed ? "closed" : left <= 0 ? "full" : "open";
      cells.push({ date, n, state, left });
    }
    return { label: `${MONTHS[mm]} ${yy}`, cells };
  }, [today, last, month, days, rules, openDays, timezone]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!product) return;
    if (!ready) {
      (optionsDone && due ? detailsRef : dayRef).current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setError(null);
    start(async () => {
      let r: { token?: string; error?: string };
      try {
        r = await placeOrder({ businessId, serviceId: product.id, size: opts.sizes.length ? size : null, flavour: opts.flavours.length ? flavour : null,
          message, designUrl: photos[0] ?? null, fulfilment, address, due: due!, timePref, name, phone, note, website: hp });
      } catch { r = { error: "generic" }; }
      if (r.token) { router.push(`/o/${r.token}?new=1`); return; }
      const msg: Record<string, [string, string]> = {
        day_full: ["ඒ දවස දැන් පිරිලා. වෙන දවසක් තෝරන්න.", "That day just filled up. Please pick another day."],
        too_soon: ["ඒ දවසට order කරන්න පරක්කු වැඩියි.", "That day is too soon to order."],
        closed: ["ඒ දවසේ shop එක වහලා.", "The shop is closed that day."],
        too_many: ["ඔයාගේ orders ගාණ වැඩියි. Shop එකට කතා කරන්න.", "Too many open orders. Please contact the shop."],
        phone: ["Phone number එක හරිද බලන්න.", "Please check the phone number."],
        address: ["Delivery address එක දාන්න.", "Please add the delivery address."],
      };
      setError((msg[r.error ?? ""] ?? ["මොකක් හරි වැරදුණා. ආයෙ try කරන්න.", "Something went wrong. Please try again."])[si ? 0 : 1]);
      if (r.error === "day_full" || r.error === "closed") { setDue(null); loadDays(); }
    });
  }

  const visible = sectionList.length > 1 && section ? products.filter((p) => p.section === section || !sectionList.includes(p.section ?? "")) : products;
  const from = (p: Product) => { const o = readOptions(p.options); return o.sizes.length ? Math.min(...o.sizes.map((s) => s.price)) : Number(p.price); };

  return (
    <form onSubmit={submit} className="space-y-4 min-w-0">
      <Step n={1} title={si ? "මොකක්ද ඕන?" : isCake ? "Choose your cake" : "What would you like?"} done={optionsDone}>
        {sectionList.length > 1 && (
          <div className="flex p-1 rounded-xl bg-black/5 dark:bg-white/5 mb-4 overflow-x-auto">
            {sectionList.map((s) => (
              <button key={s} type="button" onClick={() => setSection(s)}
                className={`flex-1 min-w-20 h-10 rounded-lg text-sm font-semibold transition ${section === s ? "bg-card shadow text-fg" : "text-muted"}`}>{s}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {visible.map((p, i) => {
            const on = product?.id === p.id;
            const o = readOptions(p.options);
            return (
              <button key={p.id} type="button" onClick={() => pick(p)}
                className={`text-left rounded-2xl border-2 overflow-hidden transition ${on ? "border-brand ring-4 ring-brand/20" : "border-line bg-card hover:border-brand/50"}`}>
                <div className="h-24 sm:h-28 flex items-center justify-center text-4xl" style={{ background: GRADS[i % GRADS.length] }}>
                  {p.image_url ? <img src={p.image_url} alt="" className="size-full object-cover" /> : icon}
                </div>
                <div className="p-2.5">
                  <div className="font-semibold text-sm leading-snug">{p.name}</div>
                  <div className="text-xs font-bold text-brand mt-0.5">{o.sizes.length > 1 ? (si ? "from " : "from ") : ""}{money(from(p))}</div>
                  {p.description && <div className="text-[11px] text-muted mt-0.5 line-clamp-2">{p.description}</div>}
                </div>
              </button>
            );
          })}
        </div>

        {product && (
          <div className="mt-5 space-y-4">
            {opts.sizes.length > 0 && (
              <div>
                <div className="label">{si ? "Size එක" : "Size"}</div>
                <div className="flex flex-wrap gap-2">
                  {opts.sizes.map((s) => (
                    <button key={s.label} type="button" onClick={() => setSize(s.label)} className={`chip ${size === s.label ? "chip-on" : ""}`}>{s.label} · {money(s.price)}</button>
                  ))}
                </div>
              </div>
            )}
            {opts.flavours.length > 0 && (
              <div>
                <div className="label">{isCake ? (si ? "Flavour එක" : "Flavour") : (si ? "Type එක" : "Type")}</div>
                <div className="flex flex-wrap gap-2">
                  {opts.flavours.map((f) => (
                    <button key={f} type="button" onClick={() => setFlavour(f)} className={`chip ${flavour === f ? "chip-on" : ""}`}>{f}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="label" htmlFor="omsg">{isCake ? (si ? "Cake එකේ ලියන්න ඕන දේ" : "Message on cake") : (si ? "Card message / විශේෂ දෙයක්" : "Message / special request")} <span className="text-muted font-normal">({si ? "optional" : "optional"})</span></label>
              <input id="omsg" className="input" maxLength={80} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={isCake ? "Happy Birthday Nethmi 🎉" : ""} />
            </div>
            {refs && (
              <PhotoPicker businessId={businessId} urls={photos} onChange={setPhotos} max={1} si={si}
                title={si ? "Design photo එකක් දාන්න" : "Add a design photo"} sub={si ? "Optional · ඕන look එක පෙන්නන්න" : "Optional · show us the look you want"} />
            )}
          </div>
        )}
      </Step>

      {optionsDone && (
        <div ref={dayRef} className="scroll-mt-4">
          <Step n={2} title={si ? "දවස තෝරන්න" : "Pick a day"} done={!!due}>
            {rules.deliveryFee !== null && (
              <div className="grid grid-cols-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 mb-4">
                {(["pickup", "delivery"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFulfilment(f)}
                    className={`h-11 rounded-lg text-sm font-bold transition ${fulfilment === f ? "bg-card shadow text-fg" : "text-muted"}`}>
                    {f === "pickup" ? "🏪 Pickup" : `🛵 Delivery${rules.deliveryFee ? ` +${money(rules.deliveryFee)}` : ""}`}
                  </button>
                ))}
              </div>
            )}
            {fulfilment === "delivery" && (
              <div className="mb-4">
                <label className="label" htmlFor="oaddr">{si ? "Delivery address එක" : "Delivery address"}</label>
                <textarea id="oaddr" rows={2} className="input h-auto py-3" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <div className="font-display font-bold">{calendar.label}</div>
              <div className="flex gap-1">
                <button type="button" aria-label="Previous month" disabled={month === 0} onClick={() => setMonth(0)} className="size-9 rounded-xl border border-line disabled:opacity-30">‹</button>
                <button type="button" aria-label="Next month" disabled={month === 1} onClick={() => setMonth(1)} className="size-9 rounded-xl border border-line disabled:opacity-30">›</button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {DOW.map((d, i) => <div key={i} className="text-[10px] font-bold text-muted pb-1">{d}</div>)}
              {calendar.cells.map((c, i) => {
                if (!c) return <div key={`e${i}`} />;
                const can = c.state === "open" && days !== null;
                const on = due === c.date;
                const sub = days === null ? "" : c.state === "full" ? "Full" : c.state === "open" ? (c.left <= 3 ? `${c.left} left` : "open") : "";
                return (
                  <button key={c.date} type="button" disabled={!can} onClick={() => { setDue(c.date); setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150); }}
                    className={`aspect-square rounded-xl border-[1.5px] flex flex-col items-center justify-center text-sm font-bold transition ${
                      on ? "bg-brand border-brand text-white shadow-lg shadow-brand/25"
                        : can ? "border-line bg-card hover:border-brand/60"
                          : c.state === "full" ? "border-line opacity-50 line-through" : "border-transparent opacity-30"}`}>
                    {c.n}
                    {sub && <span className={`text-[9px] font-semibold no-underline ${on ? "text-white/90" : c.state === "full" ? "text-red-500" : "text-muted"}`}>{sub}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted mt-3">
              {rules.leadDays > 0 ? (si ? `අඩුම තරමේ දවස් ${rules.leadDays}ක් කලින් order කරන්න · ` : `Order at least ${rules.leadDays} day${rules.leadDays > 1 ? "s" : ""} ahead · `) : ""}
              {si ? "Full = ඒ දවසේ orders පිරිලා" : "Full = that day is booked up"}
            </p>

            {due && (
              <div className="mt-4">
                <div className="label">{fulfilment === "delivery" ? (si ? "Delivery වෙලාව (optional)" : "Delivery time (optional)") : (si ? "Pickup වෙලාව (optional)" : "Pickup time (optional)")}</div>
                <div className="flex flex-wrap gap-2">
                  {(["morning", "afternoon", "evening"] as const).map((x) => (
                    <button key={x} type="button" onClick={() => setTimePref(timePref === x ? null : x)} className={`chip ${timePref === x ? "chip-on" : ""}`}>
                      {x === "morning" ? "🌅 Morning" : x === "afternoon" ? "☀️ Afternoon" : "🌙 Evening"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Step>
        </div>
      )}

      {optionsDone && due && (
        <div ref={detailsRef} className="scroll-mt-4">
          <Step n={3} title={si ? "ඔයාගේ විස්තර" : "Your details"} done={ready}>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="on">{si ? "නම" : "Your name"}</label>
                <input id="on" className="input" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="op">{si ? "Phone / WhatsApp" : "Phone / WhatsApp"}</label>
                <input id="op" className="input" required type="tel" inputMode="tel" placeholder={`+${dial} …`} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="onote">{si ? "වෙන මොනවා හරි" : "Anything else"} <span className="text-muted font-normal">(optional)</span></label>
                <textarea id="onote" rows={2} className="input h-auto py-3" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            {total !== null && (
              <div className="mt-4 rounded-2xl bg-black/5 dark:bg-white/5 p-4 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-muted">{[product?.name, size].filter(Boolean).join(" · ")}</span><b>{money(unit!)}</b></div>
                {fee > 0 && <div className="flex justify-between"><span className="text-muted">Delivery</span><b>{money(fee)}</b></div>}
                <div className="flex justify-between border-t border-line pt-1.5"><span className="font-semibold">{si ? "මුළු ගාණ" : "Total"}</span><b>{money(total)}</b></div>
                {advance > 0 && (
                  <div className="flex justify-between text-brand"><span className="font-semibold">{si ? `Confirm කරන්න advance (${rules.advancePct}%)` : `Advance to confirm (${rules.advancePct}%)`}</span><b>{money(advance)}</b></div>
                )}
                {advance > 0 && <p className="text-xs text-muted">{si ? "Advance එක ගෙවන විදිහ shop එකෙන් කියයි." : "The shop will tell you how to pay the advance."}</p>}
              </div>
            )}
            <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
          </Step>
        </div>
      )}

      {product && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-2xl rounded-2xl bg-ink/95 dark:bg-card/95 text-white backdrop-blur-xl shadow-2xl ring-1 ring-white/10 p-3 pl-5 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{[product.name, size, flavour].filter(Boolean).join(" · ")}{total !== null ? ` · ${money(total)}` : ""}</div>
              <div className="text-xs text-white/70 truncate">
                {!optionsDone ? (si ? "Options තෝරන්න" : "Choose the options") : due ? `${prettyDay(due)} · ${fulfilment === "delivery" ? "🛵 Delivery" : "🏪 Pickup"}` : (si ? "දවසක් තෝරන්න" : "Pick a day")}
              </div>
              {error && <div className="text-xs text-red-300 mt-0.5">{error}</div>}
            </div>
            <button type="submit" disabled={!optionsDone || busy}
              className="shrink-0 h-12 px-5 rounded-xl bg-brand font-bold text-sm transition hover:brightness-110 disabled:opacity-40">
              {busy ? "…" : ready ? (si ? "Order ✓" : "Place order ✓") : (si ? "ඊළඟ →" : "Next →")}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
