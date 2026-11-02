"use client";
import { useState } from "react";
import { Header } from "@/components/Header";
import { useT } from "@/components/I18nProvider";
import { createClient } from "@/lib/supabase/client";

export default function Forgot() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset`,
    });
    if (error) setErr(error.message); else setSent(true);
  }
  return (
    <>
      <Header />
      <main className="flex justify-center px-4 py-16">
        <form onSubmit={submit} className="card p-6 sm:p-8 w-full max-w-sm space-y-4">
          <h1 className="font-display font-bold text-2xl">{t("forgot_pw")}</h1>
          {sent ? <p className="text-green-600 dark:text-green-400">{t("reset_sent")}</p> : (
            <>
              <div>
                <label className="label" htmlFor="email">{t("email")}</label>
                <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              <button className="btn w-full">{t("send_link")}</button>
            </>
          )}
        </form>
      </main>
    </>
  );
}
