import Link from "next/link";
import { Header, PoweredBy } from "@/components/Header";
import { Mark } from "@/components/Logo";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const { t } = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <Header
        right={
          <Link href={user ? "/dashboard" : "/login"} className="btn-ghost h-9 text-sm">
            {user ? t("dashboard") : t("login")}
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 md:py-24 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <p className="font-display font-bold text-brand text-lg">{t("tagline")}</p>
            <h1 className="font-display font-bold text-4xl md:text-6xl tracking-tight leading-[1.1] mt-3">{t("hero_title")}</h1>
            <p className="text-lg text-muted mt-5 max-w-lg leading-relaxed">{t("hero_sub")}</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href={user ? "/dashboard" : "/signup"} className="btn">{t("start_free")} →</Link>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="w-56 h-56 md:w-72 md:h-72 rounded-[22%] bg-gradient-to-br from-brand-glow to-[#EE3F18] flex items-center justify-center shadow-2xl shadow-brand/30">
              <Mark size={170} color="#fff" />
            </div>
          </div>
        </section>
        <section className="grid sm:grid-cols-3 gap-4 pb-16">
          {[
            ["⚡", "Setup 3 min", "AI chat හෝ manual"],
            ["🙌", "No login", "Customers ලට password ඕන නෑ"],
            ["🌙", "සිංහල / EN", "Dark + light mode"],
          ].map(([i, a, b]) => (
            <div key={a} className="card p-6">
              <div className="text-3xl">{i}</div>
              <div className="font-display font-bold text-lg mt-3">{a}</div>
              <div className="text-muted mt-1">{b}</div>
            </div>
          ))}
        </section>
      </main>
      <PoweredBy />
    </>
  );
}
