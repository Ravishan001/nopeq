import { zonedToUtc } from "./time";

export type Busy = { staff_id: string | null; starts_at: string; ends_at: string };

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, "0");
const label = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export type Slot = { t: string; free: boolean };

/** Every start time of the day ("HH:MM", business time) and whether it is still free. Past times are left out. */
export function freeSlots(opts: {
  date: string; tz: string; open: string; close: string; duration: number;
  staffIds: string[]; staffId: string | null; busy: Busy[]; step?: number; now?: Date;
}) {
  const { date, tz, open, close, duration, staffIds, staffId, busy, step = 30, now = new Date() } = opts;
  const out: Slot[] = [];
  const earliest = now.getTime() + 30 * 60_000; // at least 30 min from now
  for (let m = toMin(open); m + duration <= toMin(close); m += step) {
    const start = zonedToUtc(date, label(m), tz).getTime();
    if (start < earliest) continue;
    const end = start + duration * 60_000;
    const clash = (b: Busy) => new Date(b.starts_at).getTime() < end && new Date(b.ends_at).getTime() > start;
    let ok: boolean;
    if (staffIds.length === 0) ok = !busy.some(clash);
    else if (staffId) ok = !busy.some((b) => b.staff_id === staffId && clash(b));
    else ok = staffIds.some((id) => !busy.some((b) => b.staff_id === id && clash(b)));
    out.push({ t: label(m), free: ok });
  }
  return out;
}
