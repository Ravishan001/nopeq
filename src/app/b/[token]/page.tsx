import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Header, PoweredBy } from "@/components/Header";
import { notifyBooking } from "@/lib/notify";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/time";
import { Reschedule } from "./Reschedule";
import { withdrawChange } from "./actions";

export const metadata = { title: "Booking", robots: { index: false } };

export default async function BookingStatus({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24}$/.test(token)) notFound();
  const { t, lang } = await getT();
  const si = lang === "si";
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_booking", { p_token: token });
  const b = data?.[0];
  if (!b) notFound();
  const isNew = (await searchParams).new === "1";

  async function cancel() {
    "use server";
    const s = await createClient();
    const { data: ok } = await s.rpc("cancel_booking", { p_token: token });
    if (ok) after(() => notifyBooking(token, "cancelled"));
    revalidatePath(`/b/${token}`);
  }

  const cancelled = b.status === "cancelled";
  const upcoming = !cancelled && b.status === "confirmed" && new Date(b.starts_at) > new Date();
  const pending = b.request_status === "pending" && b.requested_starts_at;
  const tz = b.timezone ?? "Asia/Colombo";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="card p-6 text-center">
          <div className={`size-20 rounded-full mx-auto flex items-center justify-center text-4xl ${cancelled ? "bg-black/5 dark:bg-white/10" : "bg-green-100 text-green-600 dark:bg-green-900/40"}`}>{cancelled ? "✕" : "✓"}</div>
          <h1 className="font-display font-bold text-2xl mt-4">{cancelled ? t("cancelled_msg") : t("booked")}</h1>
          {!cancelled && isNew && <p className="text-sm text-muted mt-2">{t("booked_sub")}</p>}

          <div className="rounded-2xl border border-line mt-6 text-left divide-y divide-[var(--line)]">
            <div className="p-4 font-display font-bold text-lg">{b.business_name}</div>
            {[
              ["🗓", fmtDateTime(b.starts_at, lang, tz)],
              b.service_name && ["✂️", `${b.service_name}${b.staff_name ? ` · ${b.staff_name}` : ""}`],
              b.branch_name && ["📍", b.branch_name],
              ["👤", b.customer_name],
            ].filter(Boolean).map((r) => {
              const [i, v] = r as [string, string];
              return <div key={i} className="px-4 py-3 flex gap-3 items-center"><span className="w-6 text-center">{i}</span><span className={i === "👤" ? "text-muted" : "font-semibold"}>{v}</span></div>;
            })}
          </div>

          {pending && (
            <div className="mt-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-left">
              <div className="font-semibold">⏳ {si ? "Salon එකේ approval එක එනකම්" : "Waiting for the salon to approve"}</div>
              <div className="text-sm mt-1">🔁 {fmtDateTime(b.requested_starts_at!, lang, tz)}{b.requested_staff_name ? ` · ${b.requested_staff_name}` : ""}</div>
              <form action={async () => { "use server"; await withdrawChange(token); }} className="mt-3">
                <button className="text-sm font-semibold text-muted underline">{si ? "Request එක අයින් කරන්න" : "Withdraw request"}</button>
              </form>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {upcoming && !pending && b.service_id && (
              <Reschedule token={token} businessId={b.business_id} serviceId={b.service_id} staffId={b.staff_id} timezone={tz} />
            )}
            {upcoming && (
              <form action={cancel}>
                <button className="btn-ghost w-full h-12 text-red-500">{t("cancel_booking")}</button>
              </form>
            )}
            <Link href={`/${b.business_slug}`} className="btn w-full">{b.business_name} →</Link>
          </div>
        </div>
      </main>
      <PoweredBy />
    </>
  );
}
