"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLang, useT } from "@/components/I18nProvider";
import { WEEKDAYS } from "@/lib/i18n";
import { COUNTRIES, currencySymbol, flag, getCountry, localPrice } from "@/lib/countries";
import { KINDS, getKind, slugify, type BusinessKind, type TemplateService } from "@/lib/templates";
import { checkSlug, createBusiness } from "./actions";

type Step = "type" | "how" | "details" | "services" | "staff";

function Progress({ n }: { n: number }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= n ? "bg-brand" : "bg-black/10 dark:bg-white/10"}`} />
      ))}
    </div>
  );
}

export function Wizard({ detectedCountry, detectedTz }: { detectedCountry: string; detectedTz: string }) {
  const t = useT();
  const lang = useLang();
  const [step, setStep] = useState<Step>("type");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // data
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchInput, setBranchInput] = useState("");
  const [kind, setKind] = useState<BusinessKind>(KINDS[0]);
  const orders = kind.mode === "orders";
  const [sections, setSections] = useState<string[]>(KINDS[0].defaultSections);
  const [dailyLimit, setDailyLimit] = useState(6);
  const [leadDays, setLeadDays] = useState(1);
  const [countryCode, setCountryCode] = useState(detectedCountry);
  const country = getCountry(countryCode);
  const [timezone, setTimezone] = useState(detectedTz);
  const priced = (k: BusinessKind, code: string) => {
    const c = getCountry(code);
    return k.services.map((s) => ({
      ...s, price: localPrice(s.price, c),
      options: s.options ? { ...s.options, sizes: s.options.sizes?.map((z) => ({ ...z, price: localPrice(z.price, c) })) } : undefined,
    }));
  };
  const [services, setServices] = useState<TemplateService[]>(() => priced(KINDS[0], detectedCountry));
  function pickKind(id: string) {
    const k = getKind(id);
    setKind(k);
    setSections(k.defaultSections);
    setServices(priced(k, countryCode));
  }
  const zones = useMemo(() => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return [country.tz]; }
  }, [country.tz]);
  const sym = currencySymbol(country.currency);

  function changeCountry(code: string) {
    setCountryCode(code);
    const c = getCountry(code);
    setTimezone(code === detectedCountry ? detectedTz : c.tz);
    // re-price only the template services the owner hasn't renamed
    setServices((prev) => prev.map((s) => {
      const tpl = kind.services.find((x) => x.name === s.name && x.section === s.section);
      return tpl ? { ...s, price: localPrice(tpl.price, c), options: tpl.options ? { ...tpl.options, sizes: tpl.options.sizes?.map((z) => ({ ...z, price: localPrice(z.price, c) })) } : undefined } : s;
    }));
  }
  const [staff, setStaff] = useState<string[]>([]);
  const [staffInput, setStaffInput] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [open, setOpen] = useState("09:00");
  const [close, setClose] = useState("20:00");

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (slug.length < 3) { setSlugOk(null); return; }
    const id = setTimeout(() => checkSlug(slug).then(setSlugOk), 400);
    return () => clearTimeout(id);
  }, [slug]);

  const visibleServices = useMemo(
    () => services.map((s, i) => ({ ...s, i })).filter((s) => sections.includes(s.section)),
    [services, sections]
  );

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const updateService = (i: number, patch: Partial<TemplateService>) =>
    setServices((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  function addBranch() {
    const v = branchInput.trim();
    if (v && !branches.includes(v)) setBranches([...branches, v]);
    setBranchInput("");
  }
  function addStaff() {
    const v = staffInput.trim();
    if (v && !staff.includes(v)) setStaff([...staff, v]);
    setStaffInput("");
  }

  function finish() {
    setError(null);
    const chosen = visibleServices.filter((s) => s.on && s.name.trim());
    start(async () => {
      const res = await createBusiness({
        type: kind.id, country: countryCode, timezone, name, slug, sections, branches,
        services: chosen.map((s) => {
          const price = Math.max(0, Number(s.price) || 0);
          // a renamed/repriced product keeps its sizes, but the first size follows the edited price
          const sz = s.options?.sizes;
          return { section: s.section, name: s.name.trim(), price, duration: Math.round(s.duration) || 30, description: s.description,
            options: s.options ? { ...s.options, sizes: sz?.length ? sz.map((z, k) => (k === 0 ? { ...z, price } : z)) : undefined } : undefined };
        }),
        staff: orders ? [] : staff, days, open, close, dailyLimit, leadDays,
      });
      if (res?.error === "exists") window.location.href = "/dashboard";
      else if (res?.error) setError(res.error === "slug" ? "Link එක දැනටමත් පාවිච්චි වෙනවා / Link already taken" : `${t("err_generic")} (${res.error})`);
    });
  }

  const back = (to: Step) => (
    <button type="button" className="btn-ghost" onClick={() => setStep(to)}>← {t("back")}</button>
  );

  return (
    <div className="card p-6 sm:p-8 w-full max-w-xl">
      {step === "type" && (
        <>
          <p className="text-sm text-muted">{t("ob_step")} 1 / 2</p>
          <h1 className="font-display font-bold text-2xl mt-1">{t("ob_type_q")}</h1>
          <p className="text-sm text-muted mt-1">{lang === "si" ? "ඔයාට ගැලපෙන booking විදිහ අපි set කරනවා" : "We'll set up the right booking style for you"}</p>
          {(["slots", "orders"] as const).map((m) => (
            <div key={m} className="mt-6">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
                <span>{m === "slots" ? (lang === "si" ? "⏰ Appointments · වෙලාවට" : "⏰ Appointments · time slots") : (lang === "si" ? "📅 Orders · දවසට" : "📅 Orders · pick a day")}</span>
                <span className="normal-case tracking-normal text-brand">{m === "slots" ? (lang === "si" ? "Slot board" : "Slot board") : (lang === "si" ? "Calendar view" : "Calendar view")}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {KINDS.filter((k) => k.mode === m).map((k) => (
                  <button key={k.id} type="button" onClick={() => pickKind(k.id)} aria-pressed={kind.id === k.id}
                    className={`rounded-2xl border-2 px-1 py-3 text-center transition ${kind.id === k.id ? "border-brand bg-soft" : "border-line bg-card hover:border-brand/50"}`}>
                    <div className="text-2xl">{k.icon}</div>
                    <div className="text-xs font-bold mt-1 leading-tight">{k[lang]}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-5 rounded-2xl border border-brand/30 bg-soft p-3.5 text-sm">
            <b>{kind.icon} {kind[lang]}</b> → {kind.hint?.[lang] ?? (orders
              ? (lang === "si" ? "Customer දවසක් තෝරලා order කරනවා. Dashboard එකේ calendar එකක් එනවා." : "Customers order for a day. Your dashboard shows a calendar.")
              : (lang === "si" ? "Customer වෙලාවක් තෝරලා book කරනවා. Dashboard එකේ slot board එකක් එනවා." : "Customers book a time. Your dashboard shows a slot board."))}
            <span className="text-muted"> {lang === "si" ? "පස්සේ Settings වලින් වෙනස් කරන්න පුළුවන්." : "You can change this later in Settings."}</span>
          </div>
          <div className="flex justify-end mt-6">
            <button type="button" className="btn" onClick={() => setStep("how")}>{t("continue")} →</button>
          </div>
        </>
      )}

      {step === "how" && (
        <>
          <p className="text-sm text-muted">{t("ob_step")} 2 / 2</p>
          <h1 className="font-display font-bold text-2xl mt-1">{t("ob_how")}</h1>
          <p className="text-sm text-muted mt-1">{t("ob_how_sub")}</p>
          <div className="space-y-3 mt-6">
            <div className="card p-5 flex gap-4 items-center opacity-60">
              <div className="text-3xl">✨</div>
              <div className="flex-1">
                <div className="font-bold">{t("ob_ai")}</div>
                <div className="text-sm text-muted">{t("ob_ai_sub")}</div>
              </div>
              <span className="chip text-xs">{t("coming_soon")}</span>
            </div>
            <button type="button" onClick={() => setStep("details")} className="card p-5 flex gap-4 items-center w-full text-left hover:border-brand hover:bg-soft transition">
              <div className="text-3xl">✍️</div>
              <div className="flex-1">
                <div className="font-bold">{t("ob_manual")}</div>
                <div className="text-sm text-muted">{t("ob_manual_sub")}</div>
              </div>
              <span className="text-brand font-bold">→</span>
            </button>
          </div>
          <div className="mt-6">{back("type")}</div>
        </>
      )}

      {step === "details" && (
        <>
          <Progress n={1} />
          <h1 className="font-display font-bold text-2xl">{t("ob_details")}</h1>
          <div className="space-y-5 mt-6">
            <div>
              <label className="label" htmlFor="bname">{t("biz_name")}</label>
              <input id="bname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Look Hair Studio" maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="slug">{t("biz_link")}</label>
              <div className="flex items-center input">
                <span className="text-muted shrink-0">nopeq.com/</span>
                <input id="slug" className="flex-1 bg-transparent outline-none min-w-0" value={slug}
                  onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
                <span className="ml-2">{slugOk === true ? "✅" : slugOk === false ? "❌" : ""}</span>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="country">{t("country")}</label>
                <select id="country" className="input" value={countryCode} onChange={(e) => changeCountry(e.target.value)}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name} · {c.currency}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="tz">{t("timezone")}</label>
                <select id="tz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <p className="text-xs text-muted sm:col-span-2 -mt-1">📍 {t("country_hint")}</p>
            </div>
            <div>
              <span className="label">{t("branches")}</span>
              <div className="flex flex-wrap gap-2">
                {branches.map((b) => (
                  <button key={b} type="button" className="chip chip-on" onClick={() => setBranches(branches.filter((x) => x !== b))}>{b} ✕</button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input className="input" value={branchInput} onChange={(e) => setBranchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBranch(); } }} placeholder={countryCode === "LK" ? "Kuliyapitiya" : "Downtown"} />
                <button type="button" className="btn-ghost h-12" onClick={addBranch}>+ {t("add")}</button>
              </div>
            </div>
            <div>
              <span className="label">{t("sections")}</span>
              <div className="flex flex-wrap gap-2">
                {kind.sections.map((s) => (
                  <button key={s} type="button" className={`chip ${sections.includes(s) ? "chip-on" : ""}`} onClick={() => setSections(toggle(sections, s))}>{s}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-8">
            {back("how")}
            <button type="button" className="btn" disabled={name.trim().length < 2 || slugOk !== true || sections.length === 0} onClick={() => setStep("services")}>{t("continue")} →</button>
          </div>
        </>
      )}

      {step === "services" && (
        <>
          <Progress n={2} />
          <h1 className="font-display font-bold text-2xl">{t("ob_services")}</h1>
          <p className="text-sm text-muted mt-1">{t("ob_services_sub")}</p>
          <div className="space-y-5 mt-6">
            {sections.map((sec) => (
              <div key={sec}>
                <div className="font-semibold text-sm text-muted mb-2">{sec}</div>
                <div className="space-y-2">
                  {visibleServices.filter((s) => s.section === sec).map((s) => (
                    <div key={s.i} className={`card p-3 flex items-center gap-3 ${s.on ? "border-brand bg-soft" : ""}`}>
                      <input type="checkbox" checked={s.on} onChange={(e) => updateService(s.i, { on: e.target.checked })} className="size-5 accent-[#F0521F]" aria-label={s.name} />
                      <div className="flex-1 min-w-0">
                        <input className="w-full bg-transparent font-semibold outline-none" value={s.name} onChange={(e) => updateService(s.i, { name: e.target.value })} />
                        {(s.options?.sizes?.length || s.options?.flavours?.length || s.description) ? (
                          <div className="text-xs text-muted truncate">{[s.description, s.options?.sizes?.map((z) => z.label).join(" / "), s.options?.flavours?.join(", ")].filter(Boolean).join(" · ")}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <span className="text-muted">{sym}</span>
                        <input type="number" min={0} step="any" className="w-24 h-9 px-2 rounded-lg bg-card border border-line text-right font-semibold" value={s.price}
                          onChange={(e) => updateService(s.i, { price: Number(e.target.value) })} />
                      </div>
                      <div className={`${orders ? "hidden" : "hidden sm:flex"} items-center gap-1 text-sm`}>
                        <input type="number" min={5} step={5} className="w-16 h-9 px-2 rounded-lg bg-card border border-line text-right" value={s.duration}
                          onChange={(e) => updateService(s.i, { duration: Number(e.target.value) })} />
                        <span className="text-muted">{t("min")}</span>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="text-brand font-semibold text-sm"
                    onClick={() => setServices([...services, { section: sec, name: "", price: 0, duration: 30, on: true }])}>
                    + {t("add_service")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-8">
            {back("details")}
            <button type="button" className="btn" disabled={!visibleServices.some((s) => s.on && s.name.trim())} onClick={() => setStep("staff")}>{t("continue")} →</button>
          </div>
        </>
      )}

      {step === "staff" && (
        <>
          <Progress n={3} />
          <h1 className="font-display font-bold text-2xl">{orders ? (lang === "si" ? "Order දවස් සහ limit" : "Order days & limits") : t("ob_staff_hours")}</h1>
          <div className="space-y-6 mt-6">
            {orders && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="dl">{lang === "si" ? "දවසකට max orders" : "Max orders a day"}</label>
                  <input id="dl" type="number" min={1} max={500} className="input" value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
                </div>
                <div>
                  <label className="label" htmlFor="ld">{lang === "si" ? "කලින් order කරන්න ඕන දවස්" : "Order how many days ahead"}</label>
                  <input id="ld" type="number" min={0} max={60} className="input" value={leadDays} onChange={(e) => setLeadDays(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} />
                </div>
                <p className="text-xs text-muted col-span-2 -mt-1">{lang === "si" ? "දවසක orders limit එක පිරුණම ඒ දවස customer ට වැහෙනවා." : "When a day reaches the limit it closes for customers."}</p>
              </div>
            )}
            <div className={orders ? "hidden" : ""}>
              <span className="label">{kind.staffWord ? `${kind.staffWord[lang]}s` : t("staff")}</span>
              <div className="flex flex-wrap gap-2">
                {staff.map((s) => (
                  <button key={s} type="button" className="chip chip-on" onClick={() => setStaff(staff.filter((x) => x !== s))}>{s} ✕</button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input className="input" value={staffInput} onChange={(e) => setStaffInput(e.target.value)} placeholder={t("add_staff")}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStaff(); } }} />
                <button type="button" className="btn-ghost h-12" onClick={addStaff}>+ {t("add")}</button>
              </div>
            </div>
            <div>
              <span className="label">{t("open_days")}</span>
              <div className="grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} type="button" onClick={() => setDays(toggle(days, d))}
                    className={`h-11 rounded-xl text-sm font-bold border transition ${days.includes(d) ? "bg-brand text-white border-brand" : "border-line text-muted"}`}>
                    {WEEKDAYS[lang][d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="open">{t("open")}</label>
                <input id="open" type="time" className="input" value={open} onChange={(e) => setOpen(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="close">{t("close")}</label>
                <input id="close" type="time" className="input" value={close} onChange={(e) => setClose(e.target.value)} />
              </div>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
          <div className="flex justify-between mt-8">
            {back("services")}
            <button type="button" className="btn" disabled={pending || days.length === 0 || close <= open} onClick={finish}>
              {pending ? "…" : t("go_live")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
