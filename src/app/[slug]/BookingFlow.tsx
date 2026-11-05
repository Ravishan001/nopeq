"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLang, useT } from "@/components/I18nProvider";
import { WEEKDAYS } from "@/lib/i18n";
import { book, getSlots } from "./actions";
import { formatMoney } from "@/lib/countries";
import type { Slot } from "@/lib/slots";
import { todayIn, weekdayOf } from "@/lib/time";
import { PhotoPicker } from "@/components/PhotoPicker";

type Service = { id: string; name: string; section: string | null; price: number; duration_min: number; description?: string | null };
type Named = { id: string; name: string };
type Staff = Named & { specialty?: string | null; portfolio?: string[] };
export type Extras = { refs: boolean; placement: boolean; staffWord: string | null; deposit: number; prepNote: string | null };

const MONTHS = { si: ["ජන", "පෙබ", "මාර්", "අප්‍රේ", "මැයි", "ජූනි", "ජූලි", "අගෝ", "සැප්", "ඔක්", "නොවැ", "දෙසැ"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
const AVATAR = ["#F0521F", "#7C3AED", "#0EA5E9", "#16A34A", "#DB2777", "#CA8A04", "#0D9488"];

function nextDays(n: number, tz: string) {
  return Array.from({ length: n }, (_, i) => {
    const date = todayIn(tz, i);
    return { date, dow: weekdayOf(date), day: Number(date.slice(8)), month: Number(date.slice(5, 7)) - 1, i };
  });
}
const to12 = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className={`size-8 rounded-full flex items-center justify-center text-sm font-bold transition ${done ? "bg-green-600 text-white" : "bg-brand text-white"}`}>{done ? "✓" : n}</span>
        <h3 className="font-display font-bold text-lg">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function BookingFlow({ businessId, sections, services, staff, branches, currency, timezone, dial, extras }: {
  businessId: string; currency: string; timezone: string; dial: string; sections: string[]; services: Service[]; staff: Staff[]; branches: Named[]; extras?: Extras;
}) {
  const ex: Extras = extras ?? { refs: false, placement: false, staffWord: null, deposit: 0, prepNote: null };
  const [refs, setRefs] = useState<string[]>([]);
  const [placement, setPlacement] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const t = useT();
  const lang = useLang();
  const si = lang === "si";
  const router = useRouter();
  const days = useMemo(() => nextDays(21, timezone), [timezone]);
  const money = (n: number) => formatMoney(Number(n), currency, si ? "si-LK" : "en");
  const sectionList = sections.filter((s) => services.some((x) => x.section === s));

  const [branch, setBranch] = useState<string | null>(branches[0]?.id ?? null);
  const [section, setSection] = useState<string | null>(sectionList[0] ?? null);
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffPicked, setStaffPicked] = useState(false);
  const [date, setDate] = useState(days[0].date);
  const [slots, setSlots] = useState<{ closed: boolean; slots: Slot[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingSlots, startSlots] = useTransition();
  const [booking, startBooking] = useTransition();
  const timeRef = useRef<HTMLDivElement>(null);
  const staffRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTime(null);
    if (!service) return;
    startSlots(async () => {
      try { setSlots(await getSlots(businessId, date, service.id, staffId)); }
      catch { setSlots({ closed: false, slots: [] }); setError(t("err_generic")); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, date, service, staffId]);

  const visible = sectionList.length > 1 && section
    ? services.filter((s) => s.section === section || !sectionList.includes(s.section ?? ""))
    : services;
  const groups = useMemo(() => {
    const g: { key: string; label: string; items: Slot[] }[] = [
      { key: "m", label: si ? "🌅 උදේ" : "🌅 Morning", items: [] },
      { key: "a", label: si ? "☀️ දවල්" : "☀️ Afternoon", items: [] },
      { key: "e", label: si ? "🌙 හවස" : "🌙 Evening", items: [] },
    ];
    for (const s of slots?.slots ?? []) {
      const h = Number(s.t.slice(0, 2));
      (h < 12 ? g[0] : h < 17 ? g[1] : g[2]).items.push(s);
    }
    return g.filter((x) => x.items.length);
  }, [slots, si]);

  const ready = !!service && !!time && name.trim().length >= 2 && phone.trim().length >= 6;
  const chosenDay = days.find((d) => d.date === date)!;
  const dayLabel = (d: (typeof days)[number]) => (d.i === 0 ? (si ? "අද" : "Today") : d.i === 1 ? (si ? "හෙට" : "Tomorrow") : WEEKDAYS[lang][d.dow]);

  const scrollTo = (r: React.RefObject<HTMLDivElement | null>) => setTimeout(() => r.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  function pickService(s: Service) {
    setService(s);
    scrollTo(staff.length > 0 ? staffRef : timeRef);
  }
  function pickStaff(id: string | null) {
    setStaffId(id);
    setStaffPicked(true);
    scrollTo(timeRef);
  }
  function pickTime(s: string) {
    setTime(s);
    setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!service || !time) return;
    if (!ready) { detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    setError(null);
    startBooking(async () => {
      let res: { token?: string; error?: string };
      try { res = await book({ businessId, branchId: branch, serviceId: service.id, staffId, date, time, name, phone, note, email, website: hp, refs, placement }); }
      catch { res = { error: "generic" }; }
      if (res.token) router.push(`/b/${res.token}?new=1`);
      else {
        setError(res.error === "limit" ? (si ? "මේ මාසේ online booking පිරිලා. Call / WhatsApp කරන්න." : "Online booking is full this month. Please call / WhatsApp.") : t(res.error === "slot_taken" ? "err_slot_taken" : res.error === "too_many" ? "err_too_many" : res.error === "phone" ? "err_phone" : "err_generic"));
        if (res.error === "slot_taken") startSlots(async () => setSlots(await getSlots(businessId, date, service.id, staffId)));
      }
    });
  }

  let n = 1;
  return (
    <form onSubmit={submit} className="space-y-4 min-w-0">
      {branches.length > 1 && (
        <Step n={n++} title={t("choose_branch")} done={!!branch}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {branches.map((b) => (
              <button key={b.id} type="button" onClick={() => setBranch(b.id)}
                className={`h-12 rounded-xl border-2 font-semibold text-sm transition ${branch === b.id ? "border-brand bg-soft text-brand" : "border-line bg-card hover:border-brand/50"}`}>
                📍 {b.name}
              </button>
            ))}
          </div>
        </Step>
      )}

      <Step n={n++} title={t("choose_service")} done={!!service}>
        {sectionList.length > 1 && (
          <div className="flex p-1 rounded-xl bg-black/5 dark:bg-white/5 mb-4 overflow-x-auto">
            {sectionList.map((s) => (
              <button key={s} type="button" onClick={() => setSection(s)}
                className={`flex-1 min-w-20 h-10 rounded-lg text-sm font-semibold transition ${section === s ? "bg-card shadow text-fg" : "text-muted"}`}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-2.5">
          {visible.map((s) => {
            const on = service?.id === s.id;
            return (
              <button key={s.id} type="button" onClick={() => pickService(s)}
                className={`group text-left rounded-2xl border-2 p-4 transition ${on ? "border-brand bg-soft" : "border-line bg-card hover:border-brand/50 hover:-translate-y-0.5"}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{s.name}</span>
                    {s.description && <span className="block text-xs text-muted mt-0.5">{s.description}</span>}
                  </span>
                  <span className={`size-5 shrink-0 rounded-full border-2 flex items-center justify-center ${on ? "border-brand bg-brand" : "border-line"}`}>
                    {on && <span className="size-2 rounded-full bg-white" />}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs font-semibold text-muted bg-black/5 dark:bg-white/10 rounded-full px-2.5 py-1">⏱ {s.duration_min >= 90 && s.duration_min % 60 === 0 ? `${s.duration_min / 60} h` : `${s.duration_min} ${t("min")}`}</span>
                  <span className="font-display font-bold">{Number(s.price) === 0 ? (si ? "Free" : "Free") : money(s.price)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Step>

      {service && staff.length > 0 && (
        <div ref={staffRef} className="scroll-mt-4">
        <Step n={n++} title={ex.staffWord ? (si ? `${ex.staffWord} තෝරන්න` : `Choose your ${ex.staffWord.toLowerCase()}`) : t("choose_staff")} done={staffPicked}>
          <div className="flex gap-3 overflow-x-auto py-2 -mx-1 px-2">
            {[{ id: null as string | null, name: t("any_staff") }, ...staff].map((s, i) => {
              const on = staffId === s.id;
              return (
                <button key={s.id ?? "any"} type="button" onClick={() => pickStaff(s.id)} className="shrink-0 w-20 flex flex-col items-center gap-2">
                  <span className={`size-16 rounded-full flex items-center justify-center text-lg font-bold text-white transition ring-offset-2 ring-offset-[var(--card)] ${on && staffPicked ? "ring-[3px] ring-brand scale-105" : "opacity-85"}`}
                    style={{ background: s.id ? AVATAR[(i - 1) % AVATAR.length] : "linear-gradient(135deg,#FF7A2F,#EE3F18)" }}>
                    {s.id ? initials(s.name) : "✦"}
                  </span>
                  <span className={`text-xs text-center leading-tight ${on ? "font-bold text-brand" : "font-medium text-muted"}`}>{s.name}</span>
                </button>
              );
            })}
          </div>
          {(() => {
            const st = staff.find((x) => x.id === staffId);
            if (!staffPicked || !st || (!st.specialty && !st.portfolio?.length)) return null;
            return (
              <div className="mt-3 rounded-2xl bg-black/5 dark:bg-white/5 p-3">
                <div className="text-sm font-semibold">{st.name}{st.specialty ? <span className="text-muted font-normal"> · {st.specialty}</span> : null}</div>
                {!!st.portfolio?.length && (
                  <div className="flex gap-2 mt-2 overflow-x-auto">
                    {st.portfolio.map((u) => (
                      <button key={u} type="button" onClick={() => setZoom(u)} className="shrink-0 size-20 rounded-xl overflow-hidden bg-black/10"><img src={u} alt="" className="size-full object-cover" /></button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </Step>
        </div>
      )}
      {zoom && (
        <button type="button" onClick={() => setZoom(null)} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" aria-label="Close">
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-2xl" />
        </button>
      )}

      {service && (
        <div ref={timeRef} className="scroll-mt-4">
          <Step n={n++} title={`${t("choose_date")} & ${si ? "වෙලාව" : "time"}`} done={!!time}>
            <div className="text-sm font-semibold text-muted mb-2">{MONTHS[lang][chosenDay.month]} {date.slice(0, 4)}</div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {days.map((d) => {
                const on = date === d.date;
                return (
                  <button key={d.date} type="button" onClick={() => setDate(d.date)}
                    className={`snap-start shrink-0 w-[68px] py-2.5 rounded-2xl border-2 text-center transition ${on ? "bg-brand text-white border-brand shadow-lg shadow-brand/25" : "border-line bg-card hover:border-brand/50"}`}>
                    <div className={`text-[11px] font-semibold ${on ? "text-white/85" : "text-muted"}`}>{dayLabel(d)}</div>
                    <div className="font-display font-bold text-2xl leading-tight">{d.day}</div>
                    <div className={`text-[10px] font-semibold ${on ? "text-white/80" : "text-muted"}`}>{MONTHS[lang][d.month]}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              {loadingSlots || !slots ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />)}</div>
              ) : slots.closed ? (
                <div className="rounded-2xl bg-black/5 dark:bg-white/5 p-6 text-center text-muted">🔒 {t("closed_day")}</div>
              ) : !slots.slots.some((x) => x.free) ? (
                <div className="rounded-2xl bg-black/5 dark:bg-white/5 p-6 text-center text-muted">😕 {t("no_slots")}</div>
              ) : (
                <div className="space-y-4">
                  {groups.map((g) => (
                    <div key={g.key}>
                      <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">{g.label}</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {g.items.map((s) => s.free ? (
                          <button key={s.t} type="button" onClick={() => pickTime(s.t)}
                            className={`h-11 rounded-xl border-2 text-sm font-bold transition ${time === s.t ? "bg-brand text-white border-brand" : "border-line bg-card hover:border-brand/60"}`}>
                            {to12(s.t)}
                          </button>
                        ) : (
                          <div key={s.t} aria-disabled title={si ? "Book කරලා" : "Booked"}
                            className="h-11 rounded-xl border border-dashed border-line flex items-center justify-center text-sm font-medium text-muted/60 line-through decoration-2 select-none">
                            {to12(s.t)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Step>
        </div>
      )}

      {service && time && (
        <div ref={detailsRef} className="scroll-mt-4">
          <Step n={n++} title={t("your_details")} done={ready}>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cn">{t("your_name")}</label>
                <input id="cn" className="input" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="cp">{t("your_phone")}</label>
                <input id="cp" className="input" required type="tel" inputMode="tel" placeholder={`+${dial} …`} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="cemail">{t("your_email")}</label>
                <input id="cemail" className="input" type="email" inputMode="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <p className="text-xs text-muted mt-1">{t("email_hint")}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="cnote">{t("note")}</label>
                <textarea id="cnote" rows={2} className="input h-auto py-3" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            {(ex.refs || ex.placement) && (
              <div className="mt-4 space-y-3">
                {ex.refs && (
                  <PhotoPicker businessId={businessId} urls={refs} onChange={setRefs} max={3} si={si}
                    title={si ? "Reference photo දාන්න" : "Add reference photos"} sub={si ? "Photos 3ක් වෙනකම් · optional" : "Up to 3 photos · optional"} />
                )}
                {ex.placement && (
                  <div>
                    <label className="label" htmlFor="cpl">{si ? "ගහන තැන සහ size එක" : "Placement & size"}</label>
                    <input id="cpl" className="input" maxLength={100} value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder={si ? "උදා: වම් අත · ~10 cm" : "e.g. left forearm · ~10 cm"} />
                  </div>
                )}
              </div>
            )}
            {ex.deposit > 0 && (
              <div className="mt-4 rounded-2xl border border-brand/30 bg-soft p-3.5 text-sm">
                💰 <b>{si ? `Confirm කරන්න deposit එක ${money(ex.deposit)}` : `Deposit ${money(ex.deposit)} to confirm`}</b>
                <div className="text-xs text-muted mt-0.5">{si ? "Final ගාණෙන් අඩු කරනවා. ගෙවන විදිහ shop එකෙන් කියයි." : "Taken off the final price. The shop will tell you how to pay."}</div>
              </div>
            )}
            {ex.prepNote && (
              <div className="mt-3 rounded-2xl bg-black/5 dark:bg-white/5 p-3.5 text-sm">🧴 <b>{si ? "එන්න කලින්:" : "Before you come:"}</b> {ex.prepNote}</div>
            )}
            {/* honeypot: hidden from people, bots fill it */}
            <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
          </Step>
        </div>
      )}

      {/* sticky summary */}
      {service && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-2xl rounded-2xl bg-ink/95 dark:bg-card/95 text-white backdrop-blur-xl shadow-2xl ring-1 ring-white/10 p-3 pl-5 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{service.name} · {money(service.price)}</div>
              <div className="text-xs text-white/70 truncate">
                {time ? `${dayLabel(chosenDay)}, ${chosenDay.day} ${MONTHS[lang][chosenDay.month]} · ${to12(time)}` : si ? "වෙලාවක් තෝරන්න" : "Pick a time"}
                {staffId ? ` · ${staff.find((s) => s.id === staffId)?.name}` : ""}
              </div>
              {error && <div className="text-xs text-red-300 mt-0.5">{error}</div>}
            </div>
            <button type="submit" disabled={!time || booking}
              className="shrink-0 h-12 px-5 rounded-xl bg-brand font-bold text-sm transition hover:brightness-110 disabled:opacity-40">
              {booking ? "…" : ready ? (si ? "Confirm ✓" : "Confirm ✓") : (si ? "ඊළඟ →" : "Next →")}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
