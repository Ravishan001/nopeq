"use client";
import { useActionState } from "react";
import { useT } from "@/components/I18nProvider";
import type { Business } from "@/lib/business";
import { saveProfile } from "../actions";
import { useMemo, useState } from "react";
import { COUNTRIES, flag, getCountry } from "@/lib/countries";

export function ProfileForm({ b }: { b: Business }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveProfile, null);
  const [country, setCountry] = useState(b.country);
  const [tz, setTz] = useState(b.timezone);
  const zones = useMemo(() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return [b.timezone]; } }, [b.timezone]);
  const f = (name: keyof Business, label: string, type = "text", ph = "") => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} className="input" defaultValue={(b[name] as string) ?? ""} placeholder={ph} />
    </div>
  );
  return (
    <form action={action} className="space-y-4" id="contact">
      {f("name", t("biz_name"))}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="country">{t("country")} · {t("currency")}</label>
          <select id="country" name="country" className="input" value={country} onChange={(e) => { setCountry(e.target.value); setTz(getCountry(e.target.value).tz); }}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name} · {c.currency}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="timezone">{t("timezone")}</label>
          <select id="timezone" name="timezone" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
            {(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {f("phone", t("phone"), "tel", "077 123 4567")}
        {f("whatsapp", t("whatsapp"), "tel", "077 123 4567")}
      </div>
      {f("address", t("address"))}
      {f("maps_url", t("maps_url"), "url", "https://maps.app.goo.gl/…")}
      <div className="grid sm:grid-cols-3 gap-4">
        {f("facebook", "Facebook", "url", "https://facebook.com/…")}
        {f("instagram", "Instagram", "url", "https://instagram.com/…")}
        {f("tiktok", "TikTok", "url", "https://tiktok.com/@…")}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{t("save")}</button>
        {state?.ok && <span className="text-green-600 dark:text-green-400 text-sm font-semibold">{t("saved")}</span>}
        {state && !state.ok && <span className="text-red-500 text-sm">{t("err_generic")} {state.error ? `(${state.error})` : ""}</span>}
      </div>
    </form>
  );
}
