"use client";
import { useMemo, useState, useTransition } from "react";
import { useLang } from "@/components/I18nProvider";
import { formatMoney, shortMoney as short } from "@/lib/countries";
import { readOptions } from "@/lib/templates";
import { todayIn, weekdayOf } from "@/lib/time";
import {
  addPhoneOrder, getDayOrders, getMonth, getOrderStats, moveOrder, setAdvancePaid, setOrderStatus, toggleClosedDay,
  type MonthData, type Order, type OrderStats, type OrderStatus,
} from "@/app/dashboard/order-actions";

export type OrderProduct = { id: string; name: string; price: number; options: unknown };
type Ctx = { currency: string; icon: string; bizName: string; si: boolean };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FLOW: OrderStatus[] = ["new", "confirmed", "making", "ready", "done"];
const LABEL: Record<OrderStatus, string> = { new: "New", confirmed: "Confirmed", making: "Making", ready: "Ready", done: "Done", cancelled: "Cancelled" };
const TAG: Record<OrderStatus, string> = {
  new: "bg-brand/15 text-brand", confirmed: "bg-sky-500/15 text-sky-600 dark:text-sky-400", making: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  ready: "bg-green-500/15 text-green-600 dark:text-green-400", done: "bg-black/5 dark:bg-white/10 text-muted", cancelled: "bg-red-500/10 text-red-500",
};
export const prettyDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");

function waText(o: Order, biz: string) {
  const item = [o.item_name, o.size].filter(Boolean).join(" ");
  const first = o.customer_name.split(" ")[0];
  const day = prettyDay(o.due_date);
  if (o.status === "ready") return `Hi ${first}, your ${item} from ${biz} is ready ${o.fulfilment === "delivery" ? "and on its way 🛵" : "for pickup 🎉"}`;
  if (o.status === "confirmed" || o.status === "new") return `Hi ${first}, your order for ${item} on ${day} is confirmed ✅ — ${biz}`;
  if (o.status === "cancelled") return `Hi ${first}, sorry — your order for ${item} on ${day} was cancelled. — ${biz}`;
  return `Hi ${first}, about your ${item} order for ${day} — ${biz}`;
}

export function OrderCard({ o, ctx, onOpen, showDay }: { o: Order; ctx: Ctx; onOpen: (o: Order) => void; showDay?: boolean }) {
  const money = (n: number) => formatMoney(n, ctx.currency, ctx.si ? "si-LK" : "en");
  return (
    <button type="button" onClick={() => onOpen(o)} className={`w-full text-left card p-3 flex items-center gap-3 hover:border-brand/50 transition ${o.status === "cancelled" || o.status === "done" ? "opacity-60" : ""}`}>
      <span className="size-12 rounded-xl bg-soft overflow-hidden flex items-center justify-center text-2xl shrink-0">
        {o.design_url ? <img src={o.design_url} alt="" className="size-full object-cover" /> : ctx.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-sm truncate">{[o.item_name, o.size].filter(Boolean).join(" · ")}</span>
        <span className="block text-xs text-muted truncate">
          {[showDay && prettyDay(o.due_date), o.customer_name, o.flavour, o.fulfilment === "delivery" ? "🛵 Delivery" : "🏪 Pickup", o.time_pref].filter(Boolean).join(" · ")}
        </span>
        {o.message && <span className="block text-xs mt-0.5 truncate">✍️ “{o.message}”</span>}
      </span>
      <span className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${TAG[o.status]}`}>{o.source === "phone" && o.status === "confirmed" ? "📞 " : ""}{LABEL[o.status]}</span>
        <span className="text-xs font-bold">{money(o.total)}</span>
      </span>
    </button>
  );
}

export function OrderSheet({ o, ctx, onClose, onChanged }: { o: Order; ctx: Ctx; onClose: () => void; onChanged: (o: Order | null) => void }) {
  const { si } = ctx;
  const money = (n: number) => formatMoney(n, ctx.currency, si ? "si-LK" : "en");
  const [busy, start] = useTransition();
  const [moving, setMoving] = useState(false);
  const [zoom, setZoom] = useState(false);
  const at = FLOW.indexOf(o.status);
  const next = o.status !== "cancelled" && at >= 0 && at < FLOW.length - 1 ? FLOW[at + 1] : null;
  const phone = digits(o.customer_phone);

  const set = (status: OrderStatus) => start(async () => { await setOrderStatus(o.id, status); onChanged({ ...o, status }); });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-card rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-line mx-auto mb-4 sm:hidden" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-bold text-xl leading-tight">{[o.item_name, o.size].filter(Boolean).join(" · ")}</h3>
            <p className="text-sm text-muted mt-0.5">{prettyDay(o.due_date)}{o.time_pref ? ` · ${o.time_pref}` : ""} · {o.fulfilment === "delivery" ? "🛵 Delivery" : "🏪 Pickup"}</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${TAG[o.status]}`}>{LABEL[o.status]}</span>
        </div>

        <div className="rounded-2xl border border-line p-3 mt-4 flex items-center gap-3">
          <span className="size-11 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center font-bold">{o.customer_name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
          <div className="min-w-0 flex-1"><div className="font-semibold truncate">{o.customer_name}</div><div className="text-xs text-muted">{o.customer_phone ?? "—"}</div></div>
          {phone && <a href={`https://wa.me/${phone}?text=${encodeURIComponent(waText(o, ctx.bizName))}`} target="_blank" rel="noopener noreferrer" className="size-10 rounded-full bg-green-600 text-white flex items-center justify-center" aria-label="WhatsApp">💬</a>}
          {phone && <a href={`tel:+${phone}`} className="size-10 rounded-full border border-line flex items-center justify-center" aria-label="Call">📞</a>}
        </div>

        <div className="mt-3 rounded-2xl bg-black/5 dark:bg-white/5 p-3 text-sm space-y-1.5">
          {o.flavour && <div className="flex justify-between"><span className="text-muted">{si ? "Flavour / type" : "Flavour / type"}</span><b>{o.flavour}</b></div>}
          {o.message && <div className="rounded-xl bg-card px-3 py-2">✍️ “{o.message}”</div>}
          {o.address && <div className="flex justify-between gap-3"><span className="text-muted shrink-0">{si ? "Address" : "Address"}</span><b className="text-right">{o.address}</b></div>}
          {o.note && <div className="text-muted">📝 {o.note}</div>}
          {o.design_url && (
            <button type="button" onClick={() => setZoom(true)} className="block w-full mt-1">
              <img src={o.design_url} alt="" className="w-full max-h-48 object-cover rounded-xl" />
              <span className="text-xs text-muted">{si ? "Customer දාපු design photo · tap කරලා ලොකු කරන්න" : "Customer's design photo · tap to enlarge"}</span>
            </button>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-line p-3 text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-muted">Total</span><b>{money(o.total)}</b></div>
          {o.advance > 0 && (
            <>
              <label className="flex justify-between items-center gap-2">
                <span className="text-muted">Advance {money(o.advance)}</span>
                <span className="flex items-center gap-2 font-semibold">
                  <span className={o.advance_paid ? "text-green-600 dark:text-green-400" : "text-muted"}>{o.advance_paid ? (si ? "ගෙව්වා ✓" : "Paid ✓") : (si ? "තාම නෑ" : "Not yet")}</span>
                  <input type="checkbox" className="size-5 accent-[#16a34a]" checked={o.advance_paid} disabled={busy}
                    onChange={(e) => { const v = e.target.checked; start(async () => { await setAdvancePaid(o.id, v); onChanged({ ...o, advance_paid: v }); }); }} />
                </span>
              </label>
              <div className="flex justify-between"><span className="text-muted">{si ? "ඉතුරු ගාණ" : "Balance"}</span><b>{money(o.total - (o.advance_paid ? o.advance : 0))}</b></div>
            </>
          )}
        </div>

        {o.status !== "cancelled" && (
          <>
            <div className="flex gap-1 mt-4">
              {FLOW.map((s, i) => (
                <button key={s} type="button" disabled={busy} onClick={() => set(s)}
                  className={`flex-1 rounded-lg py-2 text-[10.5px] font-bold border transition ${i < at ? "bg-green-500/15 text-green-600 dark:text-green-400 border-transparent" : i === at ? "bg-brand text-white border-brand" : "border-line text-muted hover:border-brand/50"}`}>
                  {i < at ? "✓ " : ""}{LABEL[s]}
                </button>
              ))}
            </div>
            {next && (
              <button type="button" disabled={busy} onClick={() => set(next)} className="btn w-full mt-3">
                {busy ? "…" : next === "ready" ? (si ? "Ready කියලා mark කරන්න ✓" : "Mark as Ready ✓") : `${si ? "ඊළඟට:" : "Mark as"} ${LABEL[next]} →`}
              </button>
            )}
            {o.status === "ready" && phone && (
              <a href={`https://wa.me/${phone}?text=${encodeURIComponent(waText(o, ctx.bizName))}`} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full mt-2 h-11 text-sm">
                💬 {si ? "Ready කියලා customer ට WhatsApp කරන්න" : "Tell the customer on WhatsApp"}
              </a>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {moving ? (
                <input type="date" className="input h-11 col-span-2" defaultValue={o.due_date} autoFocus
                  onChange={(e) => { const d = e.target.value; if (!d) return; start(async () => { await moveOrder(o.id, d); onChanged(d === o.due_date ? o : null); setMoving(false); }); }} />
              ) : (
                <button type="button" className="btn-ghost h-11 text-sm" onClick={() => setMoving(true)}>{si ? "දවස වෙනස් කරන්න" : "Change day"}</button>
              )}
              {!moving && (
                <button type="button" className="btn-ghost h-11 text-sm text-red-500" disabled={busy}
                  onClick={() => { if (confirm(si ? "මේ order එක cancel කරන්නද?" : "Cancel this order?")) set("cancelled"); }}>
                  {si ? "Cancel කරන්න" : "Cancel order"}
                </button>
              )}
            </div>
          </>
        )}
        {o.status === "cancelled" && <button type="button" className="btn-ghost w-full mt-4" onClick={() => set("confirmed")}>{si ? "ආයෙ open කරන්න" : "Restore order"}</button>}
      </div>
      {zoom && o.design_url && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setZoom(false); }} className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" aria-label="Close">
          <img src={o.design_url} alt="" className="max-h-full max-w-full rounded-2xl" />
        </button>
      )}
    </div>
  );
}

function AddOrder({ day, products, ctx, delivery, onClose, onDone }: { day: string; products: OrderProduct[]; ctx: Ctx; delivery: boolean; onClose: () => void; onDone: () => void }) {
  const { si } = ctx;
  const money = (n: number) => formatMoney(n, ctx.currency, si ? "si-LK" : "en");
  const [pid, setPid] = useState(products[0]?.id ?? "");
  const p = products.find((x) => x.id === pid);
  const opts = readOptions(p?.options);
  const [size, setSize] = useState<string | null>(null);
  const [flavour, setFlavour] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [ful, setFul] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const unit = p ? (opts.sizes.length ? opts.sizes.find((s) => s.label === size)?.price ?? null : Number(p.price)) : null;

  function save() {
    setErr(null);
    start(async () => {
      const r = await addPhoneOrder({ day, serviceId: pid, size, flavour, message, fulfilment: ful, address, name, phone: phone || undefined, total: null });
      if (r.ok) onDone();
      else setErr(r.error === "name" ? (si ? "නම දාන්න" : "Add the customer's name") : r.error === "phone" ? (si ? "Phone number එක බලන්න" : "Check the phone number") : (si ? "Save වුණේ නෑ" : "Couldn't save"));
    });
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-card rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-display font-bold text-xl">＋ {si ? "Phone order එකක්" : "Phone order"}</h3>
          <p className="text-sm text-muted">{prettyDay(day)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {products.map((x) => <button key={x.id} type="button" onClick={() => { setPid(x.id); setSize(null); setFlavour(null); }} className={`chip ${pid === x.id ? "chip-on" : ""}`}>{x.name}</button>)}
        </div>
        {opts.sizes.length > 0 && <div className="flex flex-wrap gap-2">{opts.sizes.map((s) => <button key={s.label} type="button" onClick={() => setSize(s.label)} className={`chip ${size === s.label ? "chip-on" : ""}`}>{s.label} · {money(s.price)}</button>)}</div>}
        {opts.flavours.length > 0 && <div className="flex flex-wrap gap-2">{opts.flavours.map((f) => <button key={f} type="button" onClick={() => setFlavour(f)} className={`chip ${flavour === f ? "chip-on" : ""}`}>{f}</button>)}</div>}
        <input className="input" maxLength={80} placeholder={si ? "Message (optional)" : "Message (optional)"} value={message} onChange={(e) => setMessage(e.target.value)} />
        {delivery && (
          <div className="grid grid-cols-2 p-1 rounded-xl bg-black/5 dark:bg-white/5">
            {(["pickup", "delivery"] as const).map((f) => <button key={f} type="button" onClick={() => setFul(f)} className={`h-10 rounded-lg text-sm font-bold ${ful === f ? "bg-card shadow" : "text-muted"}`}>{f === "pickup" ? "🏪 Pickup" : "🛵 Delivery"}</button>)}
          </div>
        )}
        {ful === "delivery" && <input className="input" maxLength={200} placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />}
        <div className="grid grid-cols-2 gap-2">
          <input className="input" maxLength={60} placeholder={si ? "නම" : "Name"} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" type="tel" maxLength={24} placeholder={si ? "Phone (optional)" : "Phone (optional)"} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button type="button" className="btn w-full" disabled={busy || !pid || (opts.sizes.length > 0 && !size) || name.trim().length < 2} onClick={save}>
          {busy ? "…" : `✓ ${si ? "Add කරන්න" : "Add order"}${unit !== null ? ` · ${money(unit)}` : ""}`}
        </button>
        <p className="text-xs text-muted text-center">{si ? "ඔයා add කරන orders වලට දවසේ limit එක බලපාන්නේ නෑ." : "Orders you add yourself can go over the daily limit."}</p>
      </div>
    </div>
  );
}

export function OrderCalendar({ initialMonth, initialDay, initialOrders, initialStats, products, dailyLimit, openDays, timezone, currency, icon, bizName, delivery }: {
  initialMonth: MonthData; initialDay: string; initialOrders: Order[]; initialStats: OrderStats; products: OrderProduct[];
  dailyLimit: number; openDays: number[]; timezone: string; currency: string; icon: string; bizName: string; delivery: boolean;
}) {
  const si = useLang() === "si";
  const ctx: Ctx = { currency, icon, bizName, si };
  const money = (n: number) => formatMoney(n, currency, si ? "si-LK" : "en");
  const today = todayIn(timezone);
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(initialDay);
  const [orders, setOrders] = useState(initialOrders);
  const [stats, setStats] = useState(initialStats);
  const [open, setOpen] = useState<Order | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, start] = useTransition();

  const refresh = (d = day, m = month.month) => start(async () => {
    const [mm, list, st] = await Promise.all([getMonth(m), getDayOrders(d), getOrderStats()]);
    setMonth(mm); setOrders(list); setStats(st);
  });
  const pickDay = (d: string) => { setDay(d); start(async () => setOrders(await getDayOrders(d))); };
  const shiftMonth = (n: number) => {
    const [y, m] = month.month.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1 + n, 1));
    const key = `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
    start(async () => setMonth(await getMonth(key)));
  };

  const cells = useMemo(() => {
    const [y, m] = month.month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: ({ date: string; n: number } | null)[] = Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null);
    for (let n = 1; n <= count; n++) out.push({ date: `${month.month}-${String(n).padStart(2, "0")}`, n });
    return out;
  }, [month.month]);
  const [yy, mo] = month.month.split("-").map(Number);
  const count = month.counts[day] ?? 0;
  const dayClosed = month.closed.includes(day) || !openDays.includes(weekdayOf(day));
  const live = orders.filter((o) => o.status !== "cancelled");

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {[
          [String(stats.toConfirm), si ? "Confirm කරන්න" : "New to confirm"],
          [String(stats.week), si ? "ලබන දවස් 7" : "Next 7 days"],
          [short(stats.expected, currency), si ? "එන්න තියෙන ගාණ" : "Expected"],
        ].map(([v, l]) => (
          <div key={l} className="card px-3 py-2.5"><div className="font-display font-bold text-lg leading-tight truncate">{v}</div><div className="text-[11px] text-muted font-semibold">{l}</div></div>
        ))}
      </div>

      <div className={`card mt-3 p-3 transition-opacity ${loading ? "opacity-70" : ""}`}>
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="font-display font-bold">{MONTHS[mo - 1]} {yy}</div>
          <div className="flex gap-1">
            <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="size-9 rounded-xl border border-line">‹</button>
            <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className="size-9 rounded-xl border border-line">›</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="text-[10px] font-bold text-muted pb-1">{d}</div>)}
          {cells.map((c, i) => {
            if (!c) return <div key={`e${i}`} />;
            const n = month.counts[c.date] ?? 0;
            const closed = month.closed.includes(c.date) || !openDays.includes(weekdayOf(c.date));
            const full = n >= dailyLimit;
            const on = c.date === day;
            return (
              <button key={c.date} type="button" onClick={() => pickDay(c.date)}
                className={`h-14 sm:h-16 rounded-xl border-[1.5px] flex flex-col items-center justify-start pt-1.5 gap-1 text-sm font-bold transition ${
                  on ? "border-brand bg-soft" : c.date === today ? "border-brand/60" : "border-line"} ${c.date < today && !on ? "opacity-50" : ""}`}>
                {c.n}
                {n > 0 ? (
                  <span className={`text-[10px] font-bold px-1.5 rounded-full ${full ? "bg-red-500/15 text-red-500" : n >= dailyLimit * 0.6 ? "bg-brand/15 text-brand" : "bg-green-500/15 text-green-600 dark:text-green-400"}`}>{full ? `${n}/${dailyLimit}` : n}</span>
                ) : closed ? <span className="text-[9px] font-semibold text-muted">{si ? "වහලා" : "closed"}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 px-1 text-[11px] font-semibold text-muted">
          <span>🟢 {si ? "අඩුයි" : "Light"}</span><span>🟠 Busy</span><span>🔴 Full</span><span>{si ? "දවසක් tap කරන්න → orders" : "Tap a day → orders"}</span>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="font-display font-bold text-lg">{day === today ? (si ? "අද" : "Today") : prettyDay(day)} · {count} / {dailyLimit} {si ? "orders" : "orders"}</h2>
          <p className="text-xs text-muted font-semibold">{dayClosed ? (si ? "🔒 Online orders වහලා" : "🔒 Closed for online orders") : count >= dailyLimit ? (si ? "Full · අලුත් online orders ගන්නේ නෑ" : "Full · closed for new online orders") : (si ? `තව ${dailyLimit - count}ක් ගන්න පුළුවන්` : `${dailyLimit - count} more can be ordered`)}</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mt-2 mx-1">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-glow to-brand" style={{ width: `${Math.min(100, (count / dailyLimit) * 100)}%` }} />
      </div>

      <div className="space-y-2 mt-3">
        {live.length === 0 && orders.length === 0 && <div className="card p-6 text-center text-muted text-sm">{si ? "මේ දවසට orders නෑ" : "No orders for this day"}</div>}
        {orders.map((o) => <OrderCard key={o.id} o={o} ctx={ctx} onOpen={setOpen} />)}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button type="button" className="btn-ghost h-11 text-sm" onClick={() => setAdding(true)} disabled={!products.length}>＋ {si ? "Phone order" : "Add phone order"}</button>
        {day >= today && (
          <button type="button" className="btn-ghost h-11 text-sm" disabled={loading}
            onClick={() => start(async () => { await toggleClosedDay(day); setMonth(await getMonth(month.month)); })}>
            {month.closed.includes(day) ? (si ? "🔓 දවස open කරන්න" : "🔓 Reopen this day") : (si ? "🔒 මේ දවස block කරන්න" : "🔒 Block this day")}
          </button>
        )}
      </div>

      {open && <OrderSheet o={open} ctx={ctx} onClose={() => setOpen(null)} onChanged={(x) => { if (x) setOpen(x); else setOpen(null); refresh(); }} />}
      {adding && <AddOrder day={day} products={products} ctx={ctx} delivery={delivery} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
    </div>
  );
}
