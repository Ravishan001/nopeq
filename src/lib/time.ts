export const DEFAULT_TZ = "Asia/Colombo";

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffset(at: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Wall-clock date + time in a time zone → the real instant. */
export function zonedToUtc(date: string, time: string, tz: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffset(new Date(guess), tz);
  t = guess - tzOffset(new Date(t), tz); // second pass handles DST edges
  return new Date(t);
}

export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** YYYY-MM-DD for "today" (+offset days) in a time zone */
export function todayIn(tz: string, offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + offsetDays * 86400000));
}

export function dayRange(date: string, tz: string) {
  const from = zonedToUtc(date, "00:00", tz);
  return { from: from.toISOString(), to: new Date(from.getTime() + 86400000 - 1).toISOString() };
}

/** Short, clear English date + time, e.g. "Thu, 5 Nov · 12:30 PM" (same for every language/phone). */
export function fmtDateTime(iso: string, _lang: "si" | "en", tz: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  return `${day} · ${time}`;
}

export function isValidTz(tz: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}
