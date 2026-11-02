import Link from "next/link";
import { Header } from "@/components/Header";
import { Mark, Wordmark } from "@/components/Logo";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/business";

const COPY = {
  si: {
    steps_title: "විනාඩි 3න් live",
    steps: [
      ["1", "Account එක හදන්න", "Email එකෙන් free account එකක්. Credit card ඕන නෑ."],
      ["2", "Setup කරන්න", "AI එක්ක chat කරලා, නැත්නම් tap කරලා manual. Services, ගණන්, staff, වෙලාවල්."],
      ["3", "Link එක share කරන්න", "Facebook, Instagram, WhatsApp වලට link එක දාන්න. Salon එකේ QR එක අලවන්න."],
    ],
    feat_title: "Salon එකකට ඕන ඔක්කොම",
    feats: [
      ["🙌", "Login නැතුව booking", "Customer ට ඕන නම සහ phone number එක විතරයි."],
      ["🚫", "Double booking නෑ", "එකම වෙලාවට දෙන්නෙක්ට book කරන්න බෑ. Stylist අනුව slots."],
      ["📍", "Branches කීපයක්", "ඔයාගේ branches ඔක්කොම එක තැනක."],
      ["✅", "Setup checklist", "Logo, photos, location වගේ ඉතුරු දේවල් tick කරලා ඉවර කරන්න."],
      ["🌙", "සිංහල / English", "Dark සහ light mode. Phone එකේ setting එක අනුව ඉබේම."],
      ["🔒", "ආරක්ෂිතයි", "එක salon එකක data අනිත් අයට පේන්නේ නෑ. Customer data safe."],
    ],
    price_title: "සරල ගණන්",
    plans: [
      ["Free", "Rs. 0", "Booking page · මාසෙට bookings 50 · NopeQ icon", false],
      ["Pro", "Rs. 2,500", "Unlimited bookings · reminders · තමන්ගේ logo app icon", true],
      ["AI", "Rs. 5,500", "Pro + AI agent (web + WhatsApp) 24/7", false],
    ],
    month: "/මාසෙට",
    cta_title: "අද ඉඳන් පෝලිම් එපා.",
    cta_sub: "විනාඩි 3න් ඔයාගේ booking page එක live කරන්න.",
    preview_title: "වෙලාවක් ගන්න",
  },
  en: {
    steps_title: "Live in 3 minutes",
    steps: [
      ["1", "Create an account", "Free account with your email. No credit card."],
      ["2", "Set it up", "Chat with AI, or tap through the manual setup. Services, prices, staff, hours."],
      ["3", "Share your link", "Post it on Facebook, Instagram and WhatsApp. Stick the QR code in your salon."],
    ],
    feat_title: "Everything a salon needs",
    feats: [
      ["🙌", "Book without login", "Customers only need a name and phone number."],
      ["🚫", "No double bookings", "Two people can never get the same time. Slots per stylist."],
      ["📍", "Multiple branches", "All your branches in one place."],
      ["✅", "Setup checklist", "Tick off your logo, photos and location as you go."],
      ["🌙", "සිංහල / English", "Dark and light mode, following the phone's setting."],
      ["🔒", "Secure", "Each salon's data is private. Customer data stays safe."],
    ],
    price_title: "Simple pricing",
    plans: [
      ["Free", "Rs. 0", "Booking page · 50 bookings/month · NopeQ icon", false],
      ["Pro", "Rs. 2,500", "Unlimited bookings · reminders · your logo as app icon", true],
      ["AI", "Rs. 5,500", "Pro + AI agent (web + WhatsApp) 24/7", false],
    ],
    month: "/month",
    cta_title: "No more queues, starting today.",
    cta_sub: "Get your booking page live in 3 minutes.",
    preview_title: "Book your time",
  },
} as const;

function PhonePreview({ title }: { title: string }) {
  const slots = ["10:00 AM", "11:30 AM", "2:00 PM", "3:30 PM", "5:00 PM", "6:30 PM"];
  return (
    <div className="relative mx-auto w-[300px] sm:w-[330px]">
      <div className="absolute -inset-10 bg-brand/25 blur-3xl rounded-full" aria-hidden />
      <div className="relative rounded-[48px] bg-[#05070c] p-3 shadow-2xl ring-1 ring-white/10">
        <div className="rounded-[38px] overflow-hidden bg-app">
          <div className="h-24 bg-gradient-to-br from-ink to-[#2a3358]" />
          <div className="relative px-5 pb-6 -mt-8">
            <div className="flex flex-col gap-2">
              <div className="size-16 rounded-full bg-gradient-to-br from-brand-glow to-[#EE3F18] border-4 border-[var(--bg)] flex items-center justify-center">
                <Mark size={30} color="#fff" />
              </div>
              <div>
                <div className="font-display font-bold">Look Hair Studio</div>
                <div className="text-xs text-muted">Kuliyapitiya · Negombo</div>
              </div>
            </div>
            <div className="font-display font-bold text-lg mt-5">{title}</div>
            <div className="mt-3 space-y-2">
              {[["Haircut", "1,000", true], ["Haircut + blow-dry", "2,500", false]].map(([n, p, on]) => (
                <div key={n as string} className={`rounded-xl border px-3 py-2.5 flex justify-between text-sm font-semibold ${on ? "border-brand bg-soft" : "border-line bg-card"}`}>
                  <span>{n}</span><span>Rs. {p}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-4">
              {slots.map((s, i) => (
                <div key={s} className={`rounded-lg py-2 text-center text-[11px] font-bold border ${i === 2 ? "bg-brand text-white border-brand" : "border-line bg-card"}`}>{s}</div>
              ))}
            </div>
            <div className="mt-4 h-11 rounded-xl bg-brand text-white font-bold text-sm flex items-center justify-center">Confirm · Rs. 1,000</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const { t, lang } = await getT();
  const c = COPY[lang];
  const supabase = await createClient();
  const user = await getUserFast(supabase);
  const start = user ? "/dashboard" : "/signup";

  return (
    <>
      <Header
        right={
          <Link href={user ? "/dashboard" : "/login"} className="btn-ghost h-9 text-sm">
            {user ? t("dashboard") : t("login")}
          </Link>
        }
      />

      {/* hero: full width background */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_30%,rgba(240,82,31,.18),transparent_55%)]" aria-hidden />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <p className="font-display font-bold text-brand text-lg">{t("tagline")}</p>
            <h1 className="font-display font-bold text-5xl md:text-6xl xl:text-7xl tracking-tight leading-[1.05] mt-3">{t("hero_title")}</h1>
            <p className="text-lg md:text-xl text-muted mt-6 max-w-xl leading-relaxed">{t("hero_sub")}</p>
            <div className="flex flex-wrap gap-3 mt-9">
              <Link href={start} className="btn h-14 px-7 text-lg">{t("start_free")} →</Link>
              {!user && <Link href="/login" className="btn-ghost h-14 px-7 text-lg">{t("login")}</Link>}
            </div>
          </div>
          <PhonePreview title={c.preview_title} />
        </div>
      </section>

      {/* how it works */}
      <section className="border-y border-line bg-card/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-center">{c.steps_title}</h2>
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {c.steps.map(([n, a, b]) => (
              <div key={n} className="card p-7">
                <div className="size-11 rounded-xl bg-brand text-white font-display font-bold text-xl flex items-center justify-center">{n}</div>
                <div className="font-display font-bold text-xl mt-5">{a}</div>
                <p className="text-muted mt-2 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-center">{c.feat_title}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
          {c.feats.map(([i, a, b]) => (
            <div key={a} className="card p-7">
              <div className="text-3xl">{i}</div>
              <div className="font-display font-bold text-lg mt-4">{a}</div>
              <p className="text-muted mt-1.5 leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section className="border-y border-line bg-card/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-center">{c.price_title}</h2>
          <div className="grid md:grid-cols-3 gap-6 mt-12 max-w-5xl mx-auto">
            {c.plans.map(([n, p, d, hot]) => (
              <div key={n} className={`card p-7 relative ${hot ? "border-brand ring-2 ring-brand/30" : ""}`}>
                {hot && <span className="absolute -top-3 left-7 chip chip-on text-xs py-1">Popular</span>}
                <div className={`font-display font-bold text-xl ${n === "AI" ? "text-violet-500" : hot ? "text-brand" : ""}`}>{n}</div>
                <div className="font-display font-bold text-4xl mt-3">{p}<span className="text-base text-muted font-sans font-medium"> {c.month}</span></div>
                <p className="text-muted mt-4 leading-relaxed">{d}</p>
                <Link href={start} className={`${hot ? "btn" : "btn-ghost h-12"} w-full mt-6`}>{t("start_free")}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* final cta */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-brand-glow to-[#EE3F18] text-white p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h2 className="font-display font-bold text-3xl md:text-5xl tracking-tight">{c.cta_title}</h2>
            <p className="text-white/85 text-lg mt-3">{c.cta_sub}</p>
          </div>
          <Link href={start} className="inline-flex items-center h-14 px-8 rounded-xl bg-white text-[#EE3F18] font-bold text-lg whitespace-nowrap hover:brightness-95">{t("start_free")} →</Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
          <Wordmark size={22} className="text-fg" />
          <span>© {new Date().getFullYear()} NopeQ · powered by <a href="https://ravionstudio.com" className="font-semibold text-fg hover:text-brand">Ravion Studio</a></span>
        </div>
      </footer>
    </>
  );
}
