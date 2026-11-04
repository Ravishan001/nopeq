import { decideChange, setBookingStatus } from "@/app/dashboard/actions";
import { formatMoney } from "@/lib/countries";
import { ampm, fmtDateTime, minutesIn } from "@/lib/time";
import type { Lang, TKey } from "@/lib/i18n";

export type BookingRowData = {
  id: string; starts_at: string; ends_at?: string; status: string; source?: string;
  request_status?: string | null; requested_starts_at?: string | null;
  customer_name: string; customer_phone: string | null; note: string | null;
  ref_urls?: string[] | null; placement?: string | null;
  services: { name: string; price: number } | null; staff: { name: string } | null; branches: { name: string } | null;
};

export const BOOKING_SELECT = "id, starts_at, ends_at, status, source, request_status, requested_starts_at, customer_name, customer_phone, note, services(name, price), staff:staff!bookings_staff_id_fkey(name), branches(name)";
/** + tattoo reference photos (migration 007) */
export const BOOKING_SELECT_V7 = `${BOOKING_SELECT}, ref_urls, placement`;
/** Same list without the newer columns (works before migrations 005/006 are run). */
export const BOOKING_SELECT_LEGACY = "id, starts_at, ends_at, status, customer_name, customer_phone, note, services(name, price), staff:staff!bookings_staff_id_fkey(name), branches(name)";

const AV = ["#F0521F", "#7C3AED", "#0EA5E9", "#DB2777", "#16A34A", "#CA8A04", "#0D9488"];
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const color = (n: string) => AV[[...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AV.length];

const I = {
  wa: <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.4-.3z" /></svg>,
  call: <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>,
};

export function BookingRow({ b, lang, t, tz, currency, last }: { b: BookingRowData; lang: Lang; t: (k: TKey) => string; tz: string; currency: string; last?: boolean }) {
  const si = lang === "si";
  const wa = (b.customer_phone ?? "").replace(/\D/g, "");
  const start = minutesIn(b.starts_at, tz);
  const dur = b.ends_at ? Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000) : null;
  const confirmed = b.status === "confirmed";
  const pending = confirmed && b.request_status === "pending" && b.requested_starts_at;
  const [time, mer] = ampm(start).split(" ");
  const pill =
    pending ? ["bg-amber-500/15 text-amber-600 dark:text-amber-400", si ? "Request" : "Request"] :
    b.status === "completed" ? ["bg-green-500/15 text-green-600 dark:text-green-400", t("status_completed")] :
    b.status === "no_show" ? ["bg-red-500/12 text-red-500", t("status_no_show")] :
    b.status === "cancelled" ? ["bg-black/5 dark:bg-white/10 text-muted", t("status_cancelled")] :
    ["bg-brand/12 text-brand", t("status_confirmed")];

  return (
    <div className="flex gap-2 sm:gap-3">
      <div className="w-12 sm:w-14 shrink-0 text-right pt-3.5">
        <div className="font-display font-bold text-[15px] leading-none">{time}</div>
        <div className="text-[11px] text-muted font-semibold mt-1 leading-tight">{mer}{dur ? <><br />{dur} min</> : null}</div>
      </div>
      <div className="relative w-3.5 shrink-0">
        <div className={`absolute left-1.5 top-0 w-0.5 bg-[var(--line)] ${last ? "h-6" : "-bottom-3"}`} />
        <div className={`absolute left-0 top-[18px] size-3.5 rounded-full ring-4 ring-[var(--bg)] ${pending ? "bg-amber-500" : b.status === "completed" ? "bg-green-500" : confirmed ? "bg-brand" : "bg-gray-400"}`} />
      </div>

      <div className={`card flex-1 min-w-0 p-3.5 mb-3 ${pending ? "border-amber-500/60" : ""} ${!confirmed ? "opacity-75" : ""}`}>
        <div className="flex gap-2.5 items-start">
          <div className="size-10 rounded-xl text-white font-bold text-sm flex items-center justify-center shrink-0" style={{ background: color(b.customer_name) }}>{initials(b.customer_name)}</div>
          <div className="min-w-0 flex-1">
            <div className="font-bold leading-tight">{b.customer_name}{b.source === "walkin" ? <span className="ml-1.5 text-[10px] font-bold uppercase text-muted">🚶 walk-in</span> : null}</div>
            <div className="text-sm text-muted truncate">{b.services?.name ?? "—"}</div>
          </div>
          <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${pill[0]}`}>{pill[1]}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {b.staff && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-black/5 dark:bg-white/10">✂️ {b.staff.name}</span>}
          {b.branches && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-black/5 dark:bg-white/10">📍 {b.branches.name}</span>}
          {b.services && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-soft text-brand">{formatMoney(Number(b.services.price), currency)}</span>}
          {wa && (
            <span className="ml-auto flex gap-1.5">
              <a href={`https://wa.me/${wa}`} target="_blank" aria-label="WhatsApp" className="size-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center hover:text-green-600">{I.wa}</a>
              <a href={`tel:${b.customer_phone}`} aria-label="Call" className="size-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center hover:text-brand">{I.call}</a>
            </span>
          )}
        </div>

        {b.note && <div className="text-sm text-muted mt-2.5 rounded-xl bg-black/[.04] dark:bg-white/[.05] px-3 py-2">📝 {b.note}</div>}
        {(b.placement || !!b.ref_urls?.length) && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            {b.ref_urls?.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="size-14 rounded-xl overflow-hidden bg-black/10 block"><img src={u} alt="" className="size-full object-cover" /></a>)}
            {b.placement && <span className="text-sm text-muted">📍 {b.placement}</span>}
          </div>
        )}

        {pending ? (
          <>
            <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm">
              🔁 {si ? "මෙතනට මාරු කරන්න ඉල්ලලා:" : "Wants to move to"} <b>{fmtDateTime(b.requested_starts_at!, lang, tz)}</b>
              <div className="text-muted line-through text-xs mt-0.5">{fmtDateTime(b.starts_at, lang, tz)}</div>
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-line">
              <form action={decideChange.bind(null, b.id, true)} className="flex-1"><button className="btn h-10 w-full text-sm">✓ Approve</button></form>
              <form action={decideChange.bind(null, b.id, false)} className="flex-1"><button className="btn-ghost h-10 w-full text-sm">Decline</button></form>
            </div>
          </>
        ) : confirmed ? (
          <div className="flex gap-2 mt-3 pt-3 border-t border-line">
            <form action={setBookingStatus.bind(null, b.id, "completed")} className="flex-1">
              <button className="h-10 w-full rounded-xl bg-green-600 text-white font-bold text-sm hover:brightness-110">✓ {t("mark_done")}</button>
            </form>
            <form action={setBookingStatus.bind(null, b.id, "no_show")} className="flex-1">
              <button className="btn-ghost h-10 w-full text-sm">{t("mark_noshow")}</button>
            </form>
            <details className="relative">
              <summary className="list-none btn-ghost h-10 w-10 px-0 cursor-pointer" aria-label="More">⋯</summary>
              <div className="absolute right-0 bottom-12 z-20 card p-1.5 w-44 shadow-xl">
                <form action={setBookingStatus.bind(null, b.id, "cancelled")}>
                  <button className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-500/10">✕ {t("cancel")} booking</button>
                </form>
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}
