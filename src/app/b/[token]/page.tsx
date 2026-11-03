import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyBooking } from "@/lib/notify";
import { Header, PoweredBy } from "@/components/Header";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "Booking", robots: { index: false } };

export default async function BookingStatus({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24}$/.test(token)) notFound();
  const { t, lang } = await getT();
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
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="card p-6 text-center">
          <div className={`size-20 rounded-full mx-auto flex items-center justify-center text-4xl ${cancelled ? "bg-black/5 dark:bg-white/10" : "bg-green-100 text-green-600 dark:bg-green-900/40"}`}>{cancelled ? "✕" : "✓"}</div>
          <h1 className="font-display font-bold text-2xl mt-4">{cancelled ? t("cancelled_msg") : t("booked")}</h1>
          {!cancelled && isNew && <p className="text-sm text-muted mt-2">{t("booked_sub")}</p>}
          <div className="card p-4 mt-6 text-left space-y-1.5">
            <div className="font-bold">{b.business_name}</div>
            <div>🗓 {fmtDateTime(b.starts_at, lang, b.timezone ?? "Asia/Colombo")}</div>
            {b.service_name && <div>✂️ {b.service_name}{b.staff_name ? ` · ${b.staff_name}` : ""}</div>}
            {b.branch_name && <div>📍 {b.branch_name}</div>}
            <div className="text-muted text-sm">👤 {b.customer_name}</div>
          </div>
          {!cancelled && new Date(b.starts_at) > new Date() && (
            <form action={cancel} className="mt-4">
              <button className="btn-ghost w-full text-red-500">{t("cancel_booking")}</button>
            </form>
          )}
          <Link href={`/${b.business_slug}`} className="btn w-full mt-3">{b.business_name} →</Link>
        </div>
      </main>
      <PoweredBy />
    </>
  );
}
