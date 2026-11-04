"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addBlock, addWalkin, getBoard, removeBlock, type BoardData, type BoardItem } from "@/app/dashboard/board-actions";
import { formatMoney } from "@/lib/countries";
import { ampm, hm, minutesIn, todayIn, weekdayOf } from "@/lib/time";
import { useLang } from "./I18nProvider";

type Staff = { id: string; name: string };
type Service = { id: string; name: string; duration_min: number; price: number };

const STEP = 30;
const ROW = 32; // px per 30 min
const COLORS = ["#F0521F", "#7C3AED", "#0EA5E9", "#DB2777", "#16A34A", "#CA8A04", "#0D9488"];
const GRAD = [
  "linear-gradient(135deg,#FF7A2F,#EE3F18)", "linear-gradient(135deg,#8B5CF6,#6D28D9)", "linear-gradient(135deg,#0EA5E9,#0369A1)",
  "linear-gradient(135deg,#EC4899,#BE185D)", "linear-gradient(135deg,#22C55E,#15803D)", "linear-gradient(135deg,#EAB308,#A16207)",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

type Sheet =
  | { type: "add"; staffId: string | null; start: number }
  | { type: "item"; item: BoardItem };

export function SlotBoard({ initial, staff, services, timezone, currency }: {
  initial: BoardData; staff: Staff[]; services: Service[]; timezone: string; currency: string;
}) {
  const si = useLang() === "si";
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = todayIn(timezone, i); return { d, i, dow: weekdayOf(d), n: Number(d.slice(8)) }; }), [timezone]);
  const [data, setData] = useState<BoardData>(initial);
  const [loading, start] = useTransition();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [now, setNow] = useState(() => minutesIn(new Date(), timezone));
  const isToday = data.date === days[0].d;

  useEffect(() => { const t = setInterval(() => setNow(minutesIn(new Date(), timezone)), 60_000); return () => clearInterval(t); }, [timezone]);
  const reload = (d = data.date) => start(async () => setData(await getBoard(d)));

  const cols: (Staff | null)[] = useMemo(() => (staff.length ? staff : [null]), [staff]);
  const open = data.open ? toMin(data.open) : null;
  const close = data.close ? toMin(data.close) : null;
  const rows = open !== null && close !== null ? Math.max(0, Math.ceil((close - open) / STEP)) : 0;

  // place items on the grid
  const placed = useMemo(() => {
    if (open === null) return [];
    return data.items.map((it) => {
      const s = Math.max(minutesIn(it.starts_at, timezone), open);
      const e = Math.min(minutesIn(it.ends_at, timezone) || 24 * 60, close ?? 24 * 60);
      const colIdxs = it.staff_id === null ? cols.map((_, i) => i) : [cols.findIndex((c) => c?.id === it.staff_id)].filter((i) => i >= 0);
      return { it, row: Math.floor((s - open) / STEP), span: Math.max(1, Math.ceil((e - s) / STEP)), colIdxs, startMin: s, endMin: e };
    }).filter((p) => p.colIdxs.length && p.span > 0);
  }, [data, open, close, timezone, cols]);

  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const p of placed) for (const c of p.colIdxs) for (let r = 0; r < p.span; r++) set.add(`${c}:${p.row + r}`);
    return set;
  }, [placed]);

  const bookingsCount = data.items.filter((i) => i.kind === "booking").length;
  const requests = data.items.filter((i) => i.kind === "request").length;
  const totalCells = rows * cols.length;
  const usedCells = placed.filter((p) => p.it.kind === "booking").reduce((n, p) => n + p.span * p.colIdxs.length, 0);
  const pct = totalCells ? Math.round((usedCells / totalCells) * 100) : 0;
  const freeCells = Math.max(0, totalCells - busy.size);
  const svcColor = (title: string) => GRAD[Math.abs([...title].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % GRAD.length];

  // contiguous free minutes from a cell (for the walk-in service list)
  const freeRun = (col: number, row: number) => { let r = row; while (r < rows && !busy.has(`${col}:${r}`)) r++; return (r - row) * STEP; };

  function nextFree() {
    if (open === null) return;
    const firstRow = isToday ? Math.max(0, Math.ceil((now - open) / STEP)) : 0;
    for (let r = firstRow; r < rows; r++) for (let c = 0; c < cols.length; c++) if (!busy.has(`${c}:${r}`)) return setSheet({ type: "add", staffId: cols[c]?.id ?? null, start: open + r * STEP });
  }

  return (
    <div>
      {/* day picker */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        {days.map((d) => {
          const on = d.d === data.date;
          return (
            <button key={d.d} onClick={() => reload(d.d)}
              className={`shrink-0 flex-1 min-w-[58px] rounded-xl border-2 py-1.5 text-center transition ${on ? "bg-brand border-brand text-white" : "bg-card border-line hover:border-brand/50"}`}>
              <div className={`text-[10px] font-semibold ${on ? "text-white/85" : "text-muted"}`}>{d.i === 0 ? (si ? "අද" : "Today") : DAYS[d.dow]}</div>
              <div className="font-display font-bold text-lg leading-tight">{d.n}</div>
            </button>
          );
        })}
      </div>

      {/* summary */}
      <div className="card mt-3 px-4 py-3 flex items-center gap-3">
        <div className="text-sm whitespace-nowrap"><b className="font-display">{bookingsCount} {si ? "bookings" : "booked"}</b>
          <span className="text-muted text-xs"> · {freeCells} free{requests ? ` · ${requests} request` : ""}</span></div>
        <div className="flex-1 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand-glow to-brand transition-all" style={{ width: `${pct}%` }} /></div>
        <b className="font-display text-sm">{pct}%</b>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 px-1 text-[11px] font-semibold text-muted">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand" />Booked</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm border border-dashed border-current" />{si ? "Free · tap කරලා add" : "Free · tap to add"}</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-amber-500" />Request</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 bg-red-500" />Now</span>
      </div>

      {/* grid */}
      <div className={`card mt-3 p-2 pl-0 overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
        {rows === 0 ? (
          <div className="p-10 text-center text-muted">🔒 {si ? "මේ දවසේ වහලා" : "Closed on this day"} · <Link href="/dashboard/settings?tab=hours" className="text-brand font-semibold">{si ? "වෙලාවල් වෙනස් කරන්න" : "Edit hours"}</Link></div>
        ) : (
          <div style={{ minWidth: 44 + cols.length * 92 }}>
            <div className="grid gap-1.5 pb-2 mb-1.5 border-b border-line" style={{ gridTemplateColumns: `44px repeat(${cols.length}, minmax(0,1fr))` }}>
              <div />
              {cols.map((c, i) => {
                const n = data.items.filter((x) => x.kind === "booking" && (c ? x.staff_id === c.id : true)).length;
                return (
                  <div key={c?.id ?? "all"} className="flex flex-col items-center gap-0.5 min-w-0">
                    <span className="size-7 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: COLORS[i % COLORS.length] }}>{(c?.name ?? "All")[0]}</span>
                    <span className="text-xs font-bold truncate max-w-full">{c?.name ?? (si ? "ඔක්කොම" : "All")}</span>
                    <span className="text-[10px] text-muted">{n} {si ? "bookings" : n === 1 ? "booking" : "bookings"}</span>
                  </div>
                );
              })}
            </div>

            <div className="relative grid gap-x-1.5" style={{ gridTemplateColumns: `44px repeat(${cols.length}, minmax(0,1fr))`, gridAutoRows: `${ROW}px`, rowGap: 4 }}>
              {Array.from({ length: rows }).map((_, r) => {
                const m = open! + r * STEP;
                const past = isToday && m + STEP <= now;
                return [
                  <div key={`t${r}`} className={`text-right pr-1.5 text-[10px] leading-none font-semibold ${m % 60 === 0 ? "text-fg" : "text-muted/70"}`} style={{ gridRow: r + 1, gridColumn: 1 }}>
                    {m % 60 === 0 ? ampm(m) : ""}
                  </div>,
                  ...cols.map((c, ci) => busy.has(`${ci}:${r}`) ? null : (
                    <button key={`f${r}-${ci}`} disabled={past} onClick={() => setSheet({ type: "add", staffId: c?.id ?? null, start: m })}
                      style={{ gridRow: r + 1, gridColumn: ci + 2 }} aria-label={`Add at ${ampm(m)}`}
                      className={`rounded-lg border-[1.5px] border-dashed border-line text-muted text-sm transition ${past ? "opacity-30 border-solid" : "hover:border-brand hover:text-brand hover:bg-soft"}`}>
                      {past ? "" : "+"}
                    </button>
                  )),
                ];
              })}

              {placed.map((p) => p.colIdxs.map((ci) => {
                const { it } = p;
                const past = isToday && p.endMin <= now;
                const common = { gridRow: `${p.row + 1} / span ${p.span}`, gridColumn: ci + 2 } as const;
                if (it.kind === "block") return (
                  <button key={`${it.id}-${ci}`} onClick={() => setSheet({ type: "item", item: it })} style={common}
                    className="rounded-lg text-[11px] font-bold text-muted flex items-center justify-center bg-[repeating-linear-gradient(135deg,rgba(127,127,127,.18)_0_5px,transparent_5px_10px)]">
                    ☕ {it.title}
                  </button>
                );
                if (it.kind === "request") return (
                  <button key={`${it.id}-${ci}`} onClick={() => setSheet({ type: "item", item: it })} style={common}
                    className="rounded-lg border-[1.5px] border-amber-500 text-left px-2 py-1 text-[11px] font-bold overflow-hidden bg-[repeating-linear-gradient(135deg,rgba(245,158,11,.22)_0_6px,rgba(245,158,11,.08)_6px_12px)]">
                    🔁 {ampm(p.startMin)}
                  </button>
                );
                return (
                  <button key={`${it.id}-${ci}`} onClick={() => setSheet({ type: "item", item: it })} style={{ ...common, background: svcColor(it.title) }}
                    className={`rounded-lg text-left px-2 py-1 text-white overflow-hidden shadow-sm ${past || it.status !== "confirmed" ? "opacity-55" : ""}`}>
                    <span className="block text-[11px] font-bold leading-tight truncate">{it.source === "walkin" ? "🚶 " : ""}{it.title}</span>
                    {p.span > 1 && <span className="block text-[10px] opacity-85 truncate">{ampm(p.startMin)} – {ampm(p.endMin)}</span>}
                  </button>
                );
              }))}

              {isToday && open !== null && now >= open && now <= close! && (
                <div className="absolute left-[38px] right-0 h-0.5 bg-red-500 z-10 pointer-events-none" style={{ top: ((now - open) / STEP) * (ROW + 4) }}>
                  <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {rows > 0 && (
        <button onClick={nextFree} className="fixed z-30 right-4 bottom-5 sm:right-8 sm:bottom-8 h-12 px-5 rounded-2xl bg-brand text-white font-bold shadow-xl shadow-brand/40 hover:brightness-110 active:scale-95 transition">
          ＋ Walk-in
        </button>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center" onClick={() => setSheet(null)}>
          <div className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl max-h-[88dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1.5 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4 sm:hidden" />
            {sheet.type === "add" ? (
              <AddSheet sheet={sheet} si={si} date={data.date} staff={staff} services={services} currency={currency}
                maxMinutes={freeRun(Math.max(0, cols.findIndex((c) => (c?.id ?? null) === sheet.staffId)), (sheet.start - open!) / STEP)}
                untilClose={close! - sheet.start}
                onDone={() => { setSheet(null); reload(); }} />
            ) : (
              <ItemSheet item={sheet.item} si={si} tz={timezone} currency={currency} onDone={() => { setSheet(null); reload(); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddSheet({ sheet, si, date, staff, services, currency, maxMinutes, untilClose, onDone }: {
  sheet: { staffId: string | null; start: number }; si: boolean; date: string; staff: Staff[]; services: Service[]; currency: string;
  maxMinutes: number; untilClose: number; onDone: () => void;
}) {
  const [mode, setMode] = useState<"walkin" | "block">("walkin");
  const fits = services.filter((s) => s.duration_min <= maxMinutes);
  const [serviceId, setServiceId] = useState(fits[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mins, setMins] = useState(60);
  const [whole, setWhole] = useState(false);
  const [label, setLabel] = useState(si ? "Lunch" : "Lunch");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const who = staff.find((s) => s.id === sheet.staffId)?.name;

  function save() {
    setErr(null);
    start(async () => {
      const r = mode === "walkin"
        ? await addWalkin({ date, time: hm(sheet.start), staffId: sheet.staffId, serviceId, name, phone })
        : await addBlock({ date, time: hm(sheet.start), minutes: whole ? untilClose : mins, staffId: sheet.staffId, label });
      if (r.ok) onDone();
      else setErr(r.error === "slot_taken" ? (si ? "ඒ වෙලාව දැන් ගිහින්" : "That time is no longer free") : r.error ?? "error");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display font-bold text-xl">{mode === "walkin" ? "＋ Walk-in booking" : "☕ Block time"}</h3>
        <p className="text-sm text-muted mt-0.5">{new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · {ampm(sheet.start)}{who ? ` · ${si ? "" : "with "}${who}` : ""}</p>
      </div>
      <div className="flex p-1 rounded-xl bg-black/5 dark:bg-white/5">
        {(["walkin", "block"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 h-9 rounded-lg text-sm font-semibold transition ${mode === m ? "bg-card shadow" : "text-muted"}`}>
            {m === "walkin" ? "Walk-in" : si ? "Block (lunch / leave)" : "Block time"}
          </button>
        ))}
      </div>

      {mode === "walkin" ? (
        <>
          <div>
            <div className="label">Service</div>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => {
                const ok = s.duration_min <= maxMinutes;
                return (
                  <button key={s.id} disabled={!ok} onClick={() => setServiceId(s.id)}
                    className={`chip text-xs ${serviceId === s.id ? "chip-on" : ""} ${ok ? "" : "opacity-35 line-through"}`}>
                    {s.name} · {s.duration_min}m · {formatMoney(Number(s.price), currency)}
                  </button>
                );
              })}
            </div>
            {fits.length < services.length && <p className="text-xs text-muted mt-1.5">{si ? "කපලා තියෙන ඒවාට මේ වෙලාවේ ඉඩ මදි" : "Crossed-out services don't fit in this gap"}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="wn">{si ? "නම (optional)" : "Name (optional)"}</label><input id="wn" className="input h-11" placeholder="Walk-in" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label" htmlFor="wp">{si ? "Phone (optional)" : "Phone (optional)"}</label><input id="wp" className="input h-11" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
        </>
      ) : (
        <>
          <div>
            <div className="label">{si ? "කොච්චර වෙලාවක්ද" : "How long"}</div>
            <div className="flex flex-wrap gap-2">
              {[30, 60, 90, 120].map((m) => (
                <button key={m} onClick={() => { setMins(m); setWhole(false); }} className={`chip text-xs ${!whole && mins === m ? "chip-on" : ""}`}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>
              ))}
              <button onClick={() => setWhole(true)} className={`chip text-xs ${whole ? "chip-on" : ""}`}>{si ? "දවසේ ඉතුරු ටික" : "Rest of day"}</button>
            </div>
          </div>
          <div><label className="label" htmlFor="bl">{si ? "හේතුව" : "Reason"}</label><input id="bl" className="input h-11" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="Lunch / Leave" /></div>
          <p className="text-xs text-muted">{si ? "Block කරපු වෙලාවල් customers ලට booking page එකේ පේන්නේ නෑ." : "Customers can't book blocked time."}</p>
        </>
      )}

      {err && <p className="text-sm text-red-500">{err}</p>}
      <button className="btn w-full" disabled={busy || (mode === "walkin" && !serviceId)} onClick={save}>
        {busy ? "…" : mode === "walkin" ? (si ? "✓ Booking එක add කරන්න" : "✓ Add booking") : (si ? "✓ Block කරන්න" : "✓ Block time")}
      </button>
    </div>
  );
}

function ItemSheet({ item, si, tz, currency, onDone }: { item: BoardItem; si: boolean; tz: string; currency: string; onDone: () => void }) {
  const [busy, start] = useTransition();
  const s = minutesIn(item.starts_at, tz), e = minutesIn(item.ends_at, tz);
  const wa = item.phone?.replace(/\D/g, "");
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-muted">{item.kind === "block" ? "Blocked" : item.kind === "request" ? "🔁 Change request" : item.source === "walkin" ? "🚶 Walk-in" : item.status}</div>
        <h3 className="font-display font-bold text-xl mt-1">{item.kind === "request" ? item.sub ?? "Booking" : item.title}</h3>
        <p className="text-sm text-muted">{ampm(s)} – {ampm(e)}</p>
      </div>
      {item.customer && (
        <div className="rounded-2xl border border-line p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{item.customer}</div>
            <div className="text-sm text-muted">{item.phone ?? "—"}{item.price !== undefined ? ` · ${formatMoney(item.price, currency)}` : ""}</div>
          </div>
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" className="btn-ghost h-10 px-3 text-sm">WhatsApp</a>}
          {item.phone && <a href={`tel:${item.phone}`} className="btn-ghost h-10 px-3 text-sm">Call</a>}
        </div>
      )}
      {item.kind === "block" ? (
        <button className="btn-ghost w-full h-12 text-red-500" disabled={busy} onClick={() => start(async () => { await removeBlock(item.id); onDone(); })}>
          {si ? "Block එක අයින් කරන්න" : "Remove block"}
        </button>
      ) : (
        <Link href="/dashboard/bookings" className="btn w-full">{item.kind === "request" ? (si ? "Approve / Decline →" : "Review request →") : (si ? "Bookings එකේ බලන්න →" : "Open in Bookings →")}</Link>
      )}
    </div>
  );
}
