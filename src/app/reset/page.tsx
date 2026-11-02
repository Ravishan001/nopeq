"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/components/Header";
import { useT } from "@/components/I18nProvider";
import { createClient } from "@/lib/supabase/client";

export default function Reset() {
  const t = useT();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createClient().auth.updateUser({ password: pw });
    if (error) setErr(error.message); else { router.push("/dashboard"); router.refresh(); }
  }
  return (
    <>
      <Header />
      <main className="flex justify-center px-4 py-16">
        <form onSubmit={submit} className="card p-6 sm:p-8 w-full max-w-sm space-y-4">
          <h1 className="font-display font-bold text-2xl">{t("new_pw")}</h1>
          <div>
            <label className="label" htmlFor="pw">{t("password")}</label>
            <input id="pw" type="password" required minLength={8} autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <button className="btn w-full">{t("save")}</button>
        </form>
      </main>
    </>
  );
}
