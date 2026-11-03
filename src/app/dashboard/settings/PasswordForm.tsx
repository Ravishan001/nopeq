"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/components/I18nProvider";

export function PasswordForm({ email }: { email: string | null }) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg({ ok: false, text: t("pw_mismatch") });
    setBusy(true); setMsg(null);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else { setMsg({ ok: true, text: t("pw_changed") }); setPw(""); setPw2(""); }
  }

  return (
    <form onSubmit={submit} className="card p-6 max-w-md space-y-4">
      {email && <p className="text-sm text-muted">{t("logged_in_as")}: <b className="text-fg">{email}</b></p>}
      <h2 className="font-display font-bold text-lg">{t("change_pw")}</h2>
      <div>
        <label className="label" htmlFor="npw">{t("new_pw")}</label>
        <input id="npw" type="password" required minLength={8} autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="npw2">{t("confirm_pw")}</label>
        <input id="npw2" type="password" required minLength={8} autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{msg.text}</p>}
      <button className="btn" disabled={busy}>{busy ? "…" : t("save")}</button>
    </form>
  );
}
