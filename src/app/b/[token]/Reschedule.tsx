"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLang } from "@/components/I18nProvider";
import { WEEKDAYS } from "@/lib/i18n";
import type { Slot } from "@/lib/slots";
import { todayIn, weekdayOf } from "@/lib/time";
import { getSlots } from "@/app/[slug]/actions";
import { requestChange } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const to12 = (s: string) => { const [h, m] = s.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

export function Reschedule({ token, businessId, serviceId, staffId, timezone }: { token: string; businessId: string; serviceId: string; staffId: string | null; timezone: string }) {
  const si = useLang() === "si";
  const [open, setOpen] = useState(false);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => { const date = todayIn(timezone, i); return { date, dow: weekdayOf(date), day: Number(date.slice(8)), m: Number(date.slice(5, 7)) - 1, i }; }), [timezone]);
  const [date, setDate] = useState(days[0].date);
  const [slots, setSlots] = useState<{ closed: boolean; slots: Slot[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTime(null);
    startLoad(async () => { try { setSlots(await getSlots(businessId, date, serviceId, staffId)); } catch { setSlots({ closed: false, slots: [] }); } });
  }, [open, date, businessId, serviceId, staffId]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost w-full h-12">
        🔁 {si ? "වෙලාව වෙනස් කරන්න" : "Change time"}
      </button>
    );
  }

  function send() {
    if (!time) return;
    setErr(null);
    startSend(async () => {
      const r = await requestChange(token, date, time);
      if (r.error) setErr(r.error === "slot_taken" ? (si ? "ඒ වෙලාව දැන් ගිහින්. වෙන එකක් තෝරන්න." : "That time was just taken. Pick another.") : (si ? "මොකක් හරි වැරදුණා." : "Something went wrong."));
    });
  }

  return (
    <div className="card p-4 text-left space-y-4">
      <div>
        <div className="font-display font-bold">🔁 {si ? "අලුත් වෙලාවක් තෝරන්න" : "Pick a new time"}</div>
        <p className="text-xs text-muted mt-1">{si ? "Salon එක approve කළාම විතරයි වෙනස් වෙන්නේ. ඒ වෙනකම් දැනට තියෙන වෙලාවම confirm." : "The salon approves the change. Until then your current time stays confirmed."}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {days.map((d) => (
          <button key={d.date} type="button" onClick={() => setDate(d.date)}
            className={`shrink-0 w-[60px] py-2 rounded-xl border-2 text-center transition ${date === d.date ? "bg-brand text-white border-brand" : "border-line bg-card"}`}>
            <div className="text-[10px] font-semibold opacity-80">{d.i === 0 ? "Today" : d.i === 1 ? "Tmrw" : WEEKDAYS.en[d.dow]}</div>
            <div className="font-display font-bold text-xl leading-tight">{d.day}</div>
            <div className="text-[10px] opacity-80">{MONTHS[d.m]}</div>
          </button>
        ))}
      </div>
      {loading || !slots ? (
        <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />)}</div>
      ) : slots.closed || !slots.slots.some((s) => s.free) ? (
        <p className="text-sm text-muted text-center py-4">{slots.closed ? (si ? "මේ දවසේ වහලා" : "Closed on this day") : (si ? "හිස් වෙලාවල් නෑ" : "No free times")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.slots.map((s) => s.free ? (
            <button key={s.t} type="button" onClick={() => setTime(s.t)}
              className={`h-10 rounded-xl border-2 text-sm font-bold transition ${time === s.t ? "bg-brand text-white border-brand" : "border-line bg-card"}`}>{to12(s.t)}</button>
          ) : (
            <div key={s.t} className="h-10 rounded-xl border border-dashed border-line flex items-center justify-center text-sm text-muted/60 line-through">{to12(s.t)}</div>
          ))}
        </div>
      )}
      {err && <p className="text-sm text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost h-12 flex-1" onClick={() => setOpen(false)}>{si ? "එපා" : "Cancel"}</button>
        <button type="button" className="btn h-12 flex-[2]" disabled={!time || sending} onClick={send}>
          {sending ? "…" : time ? `${si ? "Request එවන්න" : "Send request"} · ${to12(time)}` : si ? "වෙලාවක් තෝරන්න" : "Pick a time"}
        </button>
      </div>
    </div>
  );
}
