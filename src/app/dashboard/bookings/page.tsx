import Link from "next/link";
import { BOOKING_SELECT, BOOKING_SELECT_LEGACY, BookingRow, type BookingRowData } from "@/components/BookingRow";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";

export const metadata = { title: "Bookings" };

export default async function Bookings({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase, business } = await requireBusiness();
  const { t, lang } = await getT();
  const { view = "upcoming" } = await searchParams;
  const now = new Date().toISOString();
  const run = (cols: string) => {
    const q = supabase.from("bookings").select(cols).eq("business_id", business.id);
    return (view === "past" ? q.lt("starts_at", now).order("starts_at", { ascending: false }) : q.gte("starts_at", now).order("starts_at")).limit(200);
  };
  let { data, error } = await run(BOOKING_SELECT);
  if (error) {
    console.error("bookings page:", error.message);
    ({ data, error } = await run(BOOKING_SELECT_LEGACY));
  }
  const rows = (data ?? []) as unknown as BookingRowData[];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[["upcoming", t("upcoming")], ["past", "History"]].map(([v, l]) => (
          <Link key={v} href={`?view=${v}`} className={`chip ${view === v ? "chip-on" : ""}`}>{l}</Link>
        ))}
      </div>
      <div className="space-y-2">
        {rows.length ? rows.map((b) => <BookingRow key={b.id} b={b} lang={lang} t={t} tz={business.timezone} currency={business.currency} />) : <div className="card p-8 text-center text-muted">{t("no_bookings")}</div>}
      </div>
    </div>
  );
}
