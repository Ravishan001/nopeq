import { decideChange, setBookingStatus } from "@/app/dashboard/actions";
import { fmtDateTime } from "@/lib/time";
import { formatMoney } from "@/lib/countries";
import type { Lang, TKey } from "@/lib/i18n";

export type BookingRowData = {
  id: string; starts_at: string; status: string; request_status: string | null; requested_starts_at: string | null; customer_name: string; customer_phone: string; note: string | null;
  services: { name: string; price: number } | null; staff: { name: string } | null; branches: { name: string } | null;
};

export function BookingRow({ b, lang, t, tz, currency }: { b: BookingRowData; lang: Lang; t: (k: TKey) => string; tz: string; currency: string }) {
  const wa = b.customer_phone.replace(/\D/g, "");
  const statusColor: Record<string, string> = {
    confirmed: "text-brand", completed: "text-green-600 dark:text-green-400", cancelled: "text-muted line-through", no_show: "text-red-500",
  };
  const upcoming = b.status === "confirmed";
  const pending = upcoming && b.request_status === "pending" && b.requested_starts_at;
  return (
    <div className={`card p-4 flex flex-wrap gap-x-4 gap-y-2 items-center ${pending ? "border-amber-500/50" : ""}`}>
      <div className="font-display font-bold w-40 shrink-0">{fmtDateTime(b.starts_at, lang, tz)}</div>
      <div className="flex-1 min-w-48">
        <div className="font-semibold">{b.customer_name} · {b.services?.name ?? "—"}</div>
        <div className="text-sm text-muted">
          {[b.staff?.name, b.branches?.name, b.services ? formatMoney(Number(b.services.price), currency) : null].filter(Boolean).join(" · ")}
          {" · "}<a className="hover:text-brand" href={`https://wa.me/${wa}`} target="_blank">{b.customer_phone}</a>
        </div>
        {b.note && <div className="text-sm mt-1">📝 {b.note}</div>}
      </div>
      <div className={`text-sm font-bold ${statusColor[b.status] ?? ""}`}>{t(`status_${b.status}` as TKey)}</div>
      {upcoming && (
        <div className="flex gap-1.5">
          {(["completed", "no_show", "cancelled"] as const).map((s) => (
            <form key={s} action={setBookingStatus.bind(null, b.id, s)}>
              <button className="btn-ghost h-8 px-3 text-xs">{t(s === "completed" ? "mark_done" : s === "no_show" ? "mark_noshow" : "cancel")}</button>
            </form>
          ))}
        </div>
      )}
      {pending && (
        <div className="basis-full mt-1 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48 text-sm">
            <div className="font-semibold">🔁 {lang === "si" ? "වෙලාව වෙනස් කරන්න ඉල්ලලා" : "Asked to change the time"}</div>
            <div className="text-muted">{fmtDateTime(b.starts_at, lang, tz)} → <b className="text-fg">{fmtDateTime(b.requested_starts_at!, lang, tz)}</b></div>
          </div>
          <form action={decideChange.bind(null, b.id, true)}><button className="btn h-9 px-4 text-sm">✓ {lang === "si" ? "Approve" : "Approve"}</button></form>
          <form action={decideChange.bind(null, b.id, false)}><button className="btn-ghost h-9 px-4 text-sm">{lang === "si" ? "Decline" : "Decline"}</button></form>
        </div>
      )}
    </div>
  );
}

export const BOOKING_SELECT = "id, starts_at, status, request_status, requested_starts_at, customer_name, customer_phone, note, services(name, price), staff(name), branches(name)";
