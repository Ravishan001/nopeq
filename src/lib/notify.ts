import "server-only";
import { adminClient } from "./supabase/admin";
import { emailLayout, sendEmail } from "./email";
import { pushToOwner } from "./push";
import { formatMoney } from "./countries";
import { fmtDateTime } from "./time";

type Row = {
  id: string; token: string; status: string; starts_at: string; customer_name: string; customer_phone: string;
  customer_email: string | null; note: string | null; requested_starts_at: string | null; request_status: string | null;
  services: { name: string; price: number } | null; staff: { name: string } | null; branches: { name: string } | null;
  businesses: { id: string; owner_id: string; name: string; slug: string; logo_url: string | null; country: string; currency: string; timezone: string; notify_email: boolean; notify_push: boolean };
};

const SELECT = "id, token, status, starts_at, requested_starts_at, request_status, customer_name, customer_phone, customer_email, note, services(name, price), staff(name), branches(name), businesses(id, owner_id, name, slug, logo_url, country, currency, timezone, notify_email, notify_push)";
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

const LEGACY_SELECT = SELECT.replace("requested_starts_at, request_status, ", "");

async function load(token: string): Promise<{ admin: NonNullable<ReturnType<typeof adminClient>>; b: Row } | { error: string }> {
  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY missing" };
  let { data, error } = await admin.from("bookings").select(SELECT).eq("token", token).maybeSingle();
  if (error) {
    // migration 005 not run yet → still notify with the older columns
    console.error("notify load (retrying without reschedule columns):", error.message);
    ({ data, error } = await admin.from("bookings").select(LEGACY_SELECT).eq("token", token).maybeSingle());
  }
  if (error) return { error: error.message };
  if (!data) return { error: "booking not found" };
  return { admin, b: data as unknown as Row };
}

async function ownerEmail(admin: NonNullable<ReturnType<typeof adminClient>>, ownerId: string) {
  const { data } = await admin.auth.admin.getUserById(ownerId);
  return data.user?.email ?? null;
}

const titleCase = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());

/** Clean, scannable phone notification — always in English so it reads the same on every phone. */
export type NotifyKind = "new" | "cancelled" | "change_request" | "change_approved" | "change_declined";

function pushMessage(b: Row, kind: NotifyKind, fromIso?: string) {
  const biz = b.businesses;
  const when = (iso: string) => {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: biz.timezone, weekday: "short", day: "numeric", month: "short" }).format(d);
    const time = new Intl.DateTimeFormat("en-US", { timeZone: biz.timezone, hour: "numeric", minute: "2-digit" }).format(d);
    return `${day} at ${time}`;
  };
  const name = titleCase(b.customer_name);
  const service = b.services ? `${b.services.name} · ${formatMoney(Number(b.services.price), biz.currency)}` : "Booking";
  const who = [b.staff && `with ${b.staff.name}`, b.branches?.name].filter(Boolean).join(" · ");
  const head: Record<NotifyKind, string> = {
    new: `✅ New booking · ${name}`,
    cancelled: `❌ Cancelled · ${name}`,
    change_request: `🔁 Time change request · ${name}`,
    change_approved: `📅 Rescheduled · ${name}`,
    change_declined: `↩️ Change declined · ${name}`,
  };
  const lines =
    kind === "change_request" && b.requested_starts_at
      ? [`Wants ${when(b.requested_starts_at)}`, `Now ${when(b.starts_at)}`, `${service} — tap to approve`]
      : kind === "change_approved" && fromIso
        ? [`${when(b.starts_at)}  (was ${when(fromIso)})`, service, who]
        : [service, when(b.starts_at), who];
  return {
    title: head[kind],
    body: lines.filter(Boolean).join("\n"),
    url: "/dashboard/bookings",
    tag: `booking-${b.id}`,
    icon: biz.logo_url ?? undefined,
    actionLabel: kind === "change_request" ? "Review" : "View booking",
  };
}

/** Booking events → owner (push + email) and, where it matters, the customer (email). */
export async function notifyBooking(token: string, kind: NotifyKind, fromIso?: string): Promise<string> {
  try {
    const ctx = await load(token);
    if ("error" in ctx) { console.error("notifyBooking:", ctx.error); return `error: ${ctx.error}`; }
    const { admin, b } = ctx;
    const biz = b.businesses;
    const w = words(biz.country === "LK");
    const dash = `${site()}/dashboard/bookings`;
    const link = `${site()}/b/${b.token}`;
    const msg = pushMessage(b, kind, fromIso);
    const jobs: Promise<unknown>[] = [];

    // owner: everything the customer does
    const pushErrors: string[] = [];
    let pushed = 0;
    if (kind === "new" || kind === "cancelled" || kind === "change_request") {
      if (biz.notify_push) jobs.push(pushToOwner(admin, biz.owner_id, msg, pushErrors).then((n) => { pushed = n; }));
      if (biz.notify_email) {
        const rows = details(b, w, true);
        if (kind === "change_request" && b.requested_starts_at) rows.unshift(["Requested", fmtDateTime(b.requested_starts_at, "en", biz.timezone)]);
        jobs.push(ownerEmail(admin, biz.owner_id).then((to): Promise<boolean> | false =>
          (to ? sendEmail(to, msg.title, emailLayout(msg.title, rows, { label: kind === "change_request" ? "Approve / decline" : w.open, url: dash })) : false)));
      }
    }
    // customer: confirmations and the salon's decision
    if (b.customer_email && (kind === "new" || kind === "change_approved" || kind === "change_declined")) {
      const subj = kind === "new" ? w.cConfirm : kind === "change_approved" ? "Your booking time was changed ✅" : "Your time change request was declined";
      const extra = kind === "change_declined" ? "Your original booking time is still confirmed." : undefined;
      jobs.push(sendEmail(b.customer_email, `${subj} · ${biz.name}`,
        emailLayout(`${subj} · ${biz.name}`, details(b, w, false), { label: w.cView, url: link }, extra ? `${extra} ${w.cFooter}` : w.cFooter)));
    }
    await Promise.all(jobs);
    if (pushErrors.length) console.error("notifyBooking push:", pushErrors);
    return `pushed ${pushed}${biz.notify_push ? "" : " (push turned off in settings)"}${pushErrors.length ? ` · ${pushErrors[0]}` : ""}`;
  } catch (e) {
    console.error("notifyBooking", e);
    return `error: ${(e as Error).message}`;
  }
}

/** Called by the cron job: email customers ~2 hours before their booking. */
export async function sendReminders() {
  const admin = adminClient();
  if (!admin) return { error: "no service key" };
  const now = Date.now();
  const { data } = await admin.from("bookings").select(LEGACY_SELECT)
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
