"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "./I18nProvider";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    const supabase = createClient();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
      });
      if (error) setErr(error.message);
      else if (!data.session) setMsg(t("check_email"));
      else router.push("/onboarding");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
      else { router.push(params.get("next") || "/dashboard"); router.refresh(); }
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8 w-full max-w-sm space-y-4">
      <h1 className="font-display font-bold text-2xl">{mode === "login" ? t("login") : t("signup")}</h1>
      <div>
        <label className="label" htmlFor="email">{t("email")}</label>
        <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pw">{t("password")}</label>
        <input id="pw" className="input" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}
      <button className="btn w-full" disabled={busy}>{mode === "login" ? t("login") : t("signup")}</button>
      <p className="text-sm text-muted text-center">
        {mode === "login" ? t("no_account") : t("have_account")}{" "}
        <Link className="text-brand font-semibold" href={mode === "login" ? "/signup" : "/login"}>
          {mode === "login" ? t("signup") : t("login")}
        </Link>
      </p>
    </form>
  );
}
