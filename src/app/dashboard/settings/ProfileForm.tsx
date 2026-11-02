"use client";
import { useActionState } from "react";
import { useT } from "@/components/I18nProvider";
import type { Business } from "@/lib/business";
import { saveProfile } from "../actions";

export function ProfileForm({ b }: { b: Business }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveProfile, null);
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
