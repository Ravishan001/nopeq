export const TZ = "Asia/Colombo";
export const TZ_OFFSET = "+05:30";

export function fmtDateTime(iso: string, lang: "si" | "en") {
  return new Intl.DateTimeFormat(lang === "si" ? "si-LK" : "en-LK", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}
export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-LK", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
/** YYYY-MM-DD for "today" in Sri Lanka */
export function todayLK(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
export function dayRange(date: string) {
  return { from: `${date}T00:00:00${TZ_OFFSET}`, to: `${date}T23:59:59${TZ_OFFSET}` };
}
