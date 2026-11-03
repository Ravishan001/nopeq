import "server-only";
import { adminClient } from "./supabase/admin";
import { emailLayout, sendEmail } from "./email";
import { pushToOwner } from "./push";
import { formatMoney } from "./countries";
import { fmtDateTime } from "./time";

type Row = {
  id: string; token: string; status: string; starts_at: string; customer_name: string; customer_phone: string;
  customer_email: string | null; note: string | null;
  services: { name: string; price: number } | null; staff: { name: string } | null; branches: { name: string } | null;
  businesses: { id: string; owner_id: string; name: string; slug: string; country: string; currency: string; timezone: string; notify_email: boolean; notify_push: boolean };
};

const SELECT = "id, token, status, starts_at, customer_name, customer_phone, customer_email, note, services(name, price), staff(name), branches(name), businesses(id, owner_id, name, slug, country, currency, timezone, notify_email, notify_push)";
const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

function words(lk: boolean) {
  return lk
    ? { newT: "අලුත් booking එකක් 🔔", cancelT: "Booking එකක් cancel කළා", when: "වෙලාව", service: "Service", staff: "Stylist", branch: "Branch", customer: "Customer", phone: "Phone", note: "Note", open: "Dashboard එක බලන්න",
        cConfirm: "ඔයාගේ booking එක confirm ✅", cRemind: "මතක් කිරීමක්: ඔයාගේ booking එක", cView: "Booking එක බලන්න / cancel කරන්න", cFooter: "මේ email එක ආවේ ඔයා NopeQ එකෙන් booking එකක් දාපු නිසා." }
    : { newT: "New booking 🔔", cancelT: "Booking cancelled", when: "When", service: "Service", staff: "Stylist", branch: "Branch", customer: "Customer", phone: "Phone", note: "Note", open: "Open dashboard",
        cConfirm: "Your booking is confirmed ✅", cRemind: "Reminder: your booking is coming up", cView: "View / cancel booking", cFooter: "You got this email because you booked through NopeQ." };
}

function details(b: Row, w: ReturnType<typeof words>, owner: boolean) {
  const biz = b.businesses;
  const lang = biz.country === "LK" ? "si" : "en";
  const rows: [string, string][] = [[w.when, fmtDateTime(b.starts_at, lang, biz.timezone)]];
  if (b.services) rows.push([w.service, `${b.services.name} · ${formatMoney(Number(b.services.price), biz.currency)}`]);
  if (b.staff) rows.push([w.staff, b.staff.name]);
  if (b.branches) rows.push([w.branch, b.branches.name]);
  if (owner) {
    rows.push([w.customer, b.customer_name], [w.phone, b.customer_phone]);
    if (b.note) rows.push([w.note, b.note]);
  }
  return rows;
}

async function load(token: string) {
  const admin = adminClient();
  if (!admin) return null;
  const { data } = await admin.from("bookings").select(SELECT).eq("token", token).maybeSingle();
  return data ? { admin, b: data as unknown as Row } : null;
}

async function ownerEmail(admin: NonNullable<ReturnType<typeof adminClient>>, ownerId: string) {
  const { data } = await admin.auth.admin.getUserById(ownerId);
  return data.user?.email ?? null;
}

/** New booking or cancellation → owner (push + email) and, for new bookings, customer confirmation email. */
export async function notifyBooking(token: string, kind: "new" | "cancelled") {
  try {
    const ctx = await load(token);
    if (!ctx) return;
    const { admin, b } = ctx;
    const biz = b.businesses;
    const w = words(biz.country === "LK");
    const when = fmtDateTime(b.starts_at, biz.country === "LK" ? "si" : "en", biz.timezone);
    const title = kind === "new" ? w.newT : w.cancelT;
    const dash = `${site()}/dashboard/bookings`;

    const jobs: Promise<unknown>[] = [];
    if (biz.notify_push) {
      jobs.push(pushToOwner(admin, biz.owner_id, {
        title: `${title} · ${biz.name}`,
        body: `${b.customer_name} · ${b.services?.name ?? ""} · ${when}${b.staff ? ` · ${b.staff.name}` : ""}`,
        url: "/dashboard/bookings",
        tag: `booking-${b.id}`,
      }));
    }
    if (biz.notify_email) {
      jobs.push(ownerEmail(admin, biz.owner_id).then((to): Promise<boolean> | false =>
        (to ? sendEmail(to, `${title}: ${b.customer_name} · ${when}`, emailLayout(`${title} · ${biz.name}`, details(b, w, true), { label: w.open, url: dash })) : false)));
    }
    if (kind === "new" && b.customer_email) {
      jobs.push(sendEmail(b.customer_email, `${w.cConfirm} · ${biz.name}`,
        emailLayout(`${w.cConfirm} · ${biz.name}`, details(b, w, false), { label: w.cView, url: `${site()}/b/${b.token}` }, w.cFooter)));
    }
    await Promise.all(jobs);
  } catch (e) {
    console.error("notifyBooking", e);
  }
}

/** Called by the cron job: email customers ~2 hours before their booking. */
export async function sendReminders() {
  const admin = adminClient();
  if (!admin) return { error: "no service key" };
  const now = Date.now();
  const { data } = await admin.from("bookings").select(SELECT)
    .eq("status", "confirmed").is("reminder_sent_at", null).not("customer_email", "is", null)
    .gte("starts_at", new Date(now + 30 * 60_000).toISOString())
    .lte("starts_at", new Date(now + 2 * 3600_000 + 10 * 60_000).toISOString())
    .limit(200);
  let sent = 0;
  for (const b of (data ?? []) as unknown as Row[]) {
    // claim it first so two runs never send twice
    const { data: claimed } = await admin.from("bookings").update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", b.id).is("reminder_sent_at", null).select("id");
    if (!claimed?.length) continue;
    const w = words(b.businesses.country === "LK");
    const ok = await sendEmail(b.customer_email!, `${w.cRemind} · ${b.businesses.name}`,
      emailLayout(`${w.cRemind} · ${b.businesses.name}`, details(b, w, false), { label: w.cView, url: `${site()}/b/${b.token}` }, w.cFooter));
    if (ok) sent++;
  }
  return { checked: data?.length ?? 0, sent };
}
