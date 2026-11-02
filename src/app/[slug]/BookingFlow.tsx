"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLang, useT } from "@/components/I18nProvider";
import { WEEKDAYS } from "@/lib/i18n";
import { book, getSlots } from "./actions";
import { formatMoney } from "@/lib/countries";
import { todayIn, weekdayOf } from "@/lib/time";

type Service = { id: string; name: string; section: string | null; price: number; duration_min: number };
type Named = { id: string; name: string };

function nextDays(n: number, tz: string) {
  return Array.from({ length: n }, (_, i) => {
    const date = todayIn(tz, i);
    return { date, dow: weekdayOf(date), day: Number(date.slice(8)) };
  });
}

export function BookingFlow({ businessId, sections, services, staff, branches, currency, timezone, dial }: {
  businessId: string; currency: string; timezone: string; dial: string; sections: string[]; services: Service[]; staff: Named[]; branches: Named[];
}) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const days = useMemo(() => nextDays(14, timezone), [timezone]);
  const money = (n: number) => formatMoney(Number(n), currency, lang === "si" ? "si-LK" : "en");
  const sectionList = sections.filter((s) => services.some((x) => x.section === s));

  const [branch, setBranch] = useState<string | null>(branches[0]?.id ?? null);
  const [section, setSection] = useState<string | null>(sectionList[0] ?? null);
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(days[0].date);
  const [slots, setSlots] = useState<{ closed: boolean; slots: string[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [hp, setHp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingSlots, startSlots] = useTransition();
  const [booking, startBooking] = useTransition();

  useEffect(() => {
    setTime(null);
    if (!service) return;
    startSlots(async () => {
      try { setSlots(await getSlots(businessId, date, service.id, staffId)); }
      catch { setSlots({ closed: false, slots: [] }); setError(t("err_generic")); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, date, service, staffId]);

  const visible = services.filter((s) => !section || s.section === section);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !time) return;
    setError(null);
    startBooking(async () => {
      let res: { token?: string; error?: string };
      try { res = await book({ businessId, branchId: branch, serviceId: service.id, staffId, date, time, name, phone, note, website: hp }); }
      catch { res = { error: "generic" }; }
      if (res.token) router.push(`/b/${res.token}?new=1`);
      else {
        setError(t(res.error === "slot_taken" ? "err_slot_taken" : res.error === "too_many" ? "err_too_many" : res.error === "phone" ? "err_phone" : "err_generic"));
        if (res.error === "slot_taken") startSlots(async () => setSlots(await getSlots(businessId, date, service.id, staffId)));
      }
    });
  }

  const h = "font-display font-bold text-lg mb-3";
  return (
    <form onSubmit={submit} className="space-y-8">
      {branches.length > 1 && (
        <section>
          <h2 className={h}>{t("choose_branch")}</h2>
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => (
              <button key={b.id} type="button" className={`chip ${branch === b.id ? "chip-on" : ""}`} onClick={() => setBranch(b.id)}>📍 {b.name}</button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className={h}>{t("choose_service")}</h2>
        {sectionList.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {sectionList.map((s) => (
              <button key={s} type="button" className={`chip ${section === s ? "chip-on" : ""}`} onClick={() => { setSection(s); setService(null); }}>{s}</button>
            ))}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-2">
          {visible.map((s) => (
            <button key={s.id} type="button" onClick={() => setService(s)}
              className={`card p-4 text-left flex justify-between items-center gap-3 transition ${service?.id === s.id ? "border-brand bg-soft ring-2 ring-brand/20" : "hover:border-brand"}`}>
              <span>
                <span className="font-semibold block">{s.name}</span>
                <span className="text-sm text-muted">{s.duration_min} {t("min")}</span>
              </span>
              <span className="font-bold whitespace-nowrap">{money(s.price)}</span>
            </button>
          ))}
        </div>
      </section>

      {service && staff.length > 0 && (
        <section>
          <h2 className={h}>{t("choose_staff")}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`chip ${staffId === null ? "chip-on" : ""}`} onClick={() => setStaffId(null)}>{t("any_staff")}</button>
            {staff.map((s) => (
              <button key={s.id} type="button" className={`chip ${staffId === s.id ? "chip-on" : ""}`} onClick={() => setStaffId(s.id)}>{s.name}</button>
            ))}
          </div>
        </section>
      )}

      {service && (
        <section>
          <h2 className={h}>{t("choose_date")}</h2>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {days.map((d) => (
              <button key={d.date} type="button" onClick={() => setDate(d.date)}
                className={`shrink-0 w-16 py-2.5 rounded-2xl border text-center transition ${date === d.date ? "bg-brand text-white border-brand" : "border-line bg-card"}`}>
                <div className="text-xs font-semibold opacity-80">{WEEKDAYS[lang][d.dow]}</div>
                <div className="font-display font-bold text-xl">{d.day}</div>
              </button>
            ))}
          </div>
          <h2 className={`${h} mt-6`}>{t("choose_time")}</h2>
          {loadingSlots || !slots ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-11 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />)}</div>
          ) : slots.closed ? (
            <p className="text-muted">{t("closed_day")}</p>
          ) : slots.slots.length === 0 ? (
            <p className="text-muted">{t("no_slots")}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {slots.slots.map((s) => {
                const [hh, mm] = s.split(":").map(Number);
                const lbl = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
                return (
                  <button key={s} type="button" onClick={() => setTime(s)}
                    className={`h-11 rounded-xl border text-sm font-bold transition ${time === s ? "bg-brand text-white border-brand" : "border-line bg-card hover:border-brand"}`}>{lbl}</button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {service && time && (
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-lg">{t("your_details")}</h2>
            <p className="text-sm text-muted">{t("no_login")}</p>
          </div>
          <div>
            <label className="label" htmlFor="cn">{t("your_name")}</label>
            <input id="cn" className="input" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="cp">{t("your_phone")}</label>
            <input id="cp" className="input" required type="tel" inputMode="tel" placeholder={`+${dial} …`} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
          <div>
            <label className="label" htmlFor="cnote">{t("note")}</label>
            <input id="cnote" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {/* honeypot: hidden from people, bots fill it */}
          <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button className="btn w-full" disabled={booking}>{booking ? "…" : `${t("confirm_booking")} · ${money(service.price)}`}</button>
        </section>
      )}
    </form>
  );
}
