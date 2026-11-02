"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLang, useT } from "@/components/I18nProvider";
import { WEEKDAYS } from "@/lib/i18n";
import { BUSINESS_TYPES, SALON_SECTIONS, SALON_SERVICES, slugify, type TemplateService } from "@/lib/templates";
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

export function Wizard() {
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
  const [sections, setSections] = useState<string[]>(["Gents", "Ladies"]);
  const [services, setServices] = useState<TemplateService[]>(SALON_SERVICES);
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
        type: "salon", name, slug, sections, branches,
        services: chosen.map((s) => ({ section: s.section, name: s.name.trim(), price: Math.round(s.price) || 0, duration: Math.round(s.duration) || 30 })),
        staff, days, open, close,
      });
      if (res?.error) setError(res.error === "slug" ? "Link එක දැනටමත් පාවිච්චි වෙනවා / Link already taken" : t("err_generic"));
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
          <div className="grid grid-cols-2 gap-3 mt-6">
            {BUSINESS_TYPES.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={!b.ready}
                onClick={() => setStep("how")}
                className={`card p-4 text-left transition ${b.ready ? "hover:border-brand hover:bg-soft" : "opacity-50 cursor-not-allowed"}`}
              >
                <div className="text-2xl">{b.icon}</div>
                <div className="font-semibold mt-2">{b[lang]}</div>
                {!b.ready && <div className="text-xs text-muted mt-1">{t("coming_soon")}</div>}
              </button>
            ))}
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
            <div>
              <span className="label">{t("branches")}</span>
              <div className="flex flex-wrap gap-2">
                {branches.map((b) => (
                  <button key={b} type="button" className="chip chip-on" onClick={() => setBranches(branches.filter((x) => x !== b))}>{b} ✕</button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input className="input" value={branchInput} onChange={(e) => setBranchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBranch(); } }} placeholder="Kuliyapitiya" />
                <button type="button" className="btn-ghost h-12" onClick={addBranch}>+ {t("add")}</button>
              </div>
            </div>
            <div>
              <span className="label">{t("sections")}</span>
              <div className="flex flex-wrap gap-2">
                {SALON_SECTIONS.map((s) => (
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
                      <input className="flex-1 bg-transparent font-semibold outline-none min-w-0" value={s.name} onChange={(e) => updateService(s.i, { name: e.target.value })} />
                      <div className="flex items-center gap-1 text-sm">
                        <span className="text-muted">Rs.</span>
                        <input type="number" min={0} className="w-20 h-9 px-2 rounded-lg bg-card border border-line text-right font-semibold" value={s.price}
                          onChange={(e) => updateService(s.i, { price: Number(e.target.value) })} />
                      </div>
                      <div className="hidden sm:flex items-center gap-1 text-sm">
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
          <h1 className="font-display font-bold text-2xl">{t("ob_staff_hours")}</h1>
          <div className="space-y-6 mt-6">
            <div>
              <span className="label">{t("staff")}</span>
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
