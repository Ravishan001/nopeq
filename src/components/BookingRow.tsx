import { setBookingStatus } from "@/app/dashboard/actions";
import { fmtDateTime } from "@/lib/time";
import type { Lang, TKey } from "@/lib/i18n";

export type BookingRowData = {
  id: string; starts_at: string; status: string; customer_name: string; customer_phone: string; note: string | null;
  services: { name: string; price: number } | null; staff: { name: string } | null; branches: { name: string } | null;
};

export function BookingRow({ b, lang, t }: { b: BookingRowData; lang: Lang; t: (k: TKey) => string }) {
  const wa = b.customer_phone.replace(/\D/g, "").replace(/^0/, "94");
  const statusColor: Record<string, string> = {
    confirmed: "text-brand", completed: "text-green-600 dark:text-green-400", cancelled: "text-muted line-through", no_show: "text-red-500",
  };
  const upcoming = b.status === "confirmed";
  return (
    <div className="card p-4 flex flex-wrap gap-x-4 gap-y-2 items-center">
      <div className="font-display font-bold w-40 shrink-0">{fmtDateTime(b.starts_at, lang)}</div>
      <div className="flex-1 min-w-48">
        <div className="font-semibold">{b.customer_name} · {b.services?.name ?? "—"}</div>
        <div className="text-sm text-muted">
          {[b.staff?.name, b.branches?.name, b.services ? `Rs. ${b.services.price.toLocaleString()}` : null].filter(Boolean).join(" · ")}
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
    </div>
  );
}

export const BOOKING_SELECT = "id, starts_at, status, customer_name, customer_phone, note, services(name, price), staff(name), branches(name)";
