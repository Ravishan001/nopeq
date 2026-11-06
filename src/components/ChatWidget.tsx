"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Meta = { chips?: string[]; booking?: { token: string; summary: string }; order?: { token: string; summary: string }; handoff?: boolean };
type Msg = { role: "user" | "assistant" | "owner"; content: string; meta?: Meta | null };

const KEY = (slug: string) => `nq-chat-${slug}`;
const read = (slug: string) => { try { return localStorage.getItem(KEY(slug)); } catch { return null; } };
const save = (slug: string, t: string) => { try { localStorage.setItem(KEY(slug), t); } catch { /* private mode */ } };

/** Tiny **bold** support, nothing else (no HTML from the model). */
function Text({ s }: { s: string }) {
  return <>{s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>;
}

export function ChatWidget({ slug, name, icon, logo, si, autoOpen }: { slug: string; name: string; icon: string; logo: string | null; si: boolean; autoOpen?: boolean }) {
  const [open, setOpen] = useState(!!autoOpen);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const greeting: Msg = { role: "assistant", content: si ? `ආයුබෝවන්! 👋 මම ${name} එකේ assistant. Booking, ගාණ, වෙලාවල් ගැන අහන්න — සිංහලෙන්, Singlish වලින් හරි English වලින් හරි.` : `Hi! 👋 I'm the ${name} assistant. Ask about bookings, prices or times — in English, Sinhala or Singlish.` };

  const load = useCallback(async (t: string) => {
    const r = await fetch(`/api/ai/chat?slug=${slug}&token=${t}`).then((x) => x.json()).catch(() => null);
    if (r?.messages) setMsgs(r.messages);
  }, [slug]);

  useEffect(() => { const t = read(slug); if (t) { setToken(t); load(t); } }, [slug, load]);
  // owner replies arrive while the chat is open
  useEffect(() => {
    if (!open || !token) return;
    const id = setInterval(() => load(token), 12000);
    return () => clearInterval(id);
  }, [open, token, load]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy, open]);

  // Phones: fit the chat to the part of the screen the keyboard leaves free, and stop the
  // page behind it from scrolling, so the box and the send button don't jump around.
  const [vp, setVp] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const mobile = () => window.innerWidth < 640;
    const fit = () => setVp(mobile() && vv ? { h: Math.round(vv.height), top: Math.round(vv.offsetTop) } : null);
    fit();
    vv?.addEventListener("resize", fit); vv?.addEventListener("scroll", fit); window.addEventListener("resize", fit);
    const { overflow } = document.body.style, html = document.documentElement.style.overflow;
    if (mobile()) { document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden"; }
    return () => {
      vv?.removeEventListener("resize", fit); vv?.removeEventListener("scroll", fit); window.removeEventListener("resize", fit);
      document.body.style.overflow = overflow; document.documentElement.style.overflow = html;
    };
  }, [open]);

  async function send(m: string) {
    const message = m.trim();
    if (!message || busy) return;
    setErr(null);
    setText("");
    setMsgs((x) => [...x, { role: "user", content: message }]);
    setBusy(true);
    try {
      const r = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, token, message }) });
      const j = await r.json().catch(() => ({ error: "server", reason: `http-${r.status}` }));
      if (j.token) { setToken(j.token); save(slug, j.token); }
      if (j.message) setMsgs((x) => [...x, j.message]);
      else setErr(j.error === "limit" ? (si ? "Assistant එක මේ මාසේ busy. Booking page එකෙන් book කරන්න." : "The assistant is busy this month — please book on the page.") : j.error === "long" ? (si ? "Chat එක දිග වැඩියි. Page එකෙන් book කරන්න." : "This chat is too long — please book on the page.") : (si ? "Reply එක ආවේ නෑ. ආයෙ try කරන්න." : "No reply — please try again.") + (j.reason ? ` (${j.reason})` : ""));
    } catch {
      setErr(si ? "Internet එක බලලා ආයෙ try කරන්න." : "Check your connection and try again.");
    }
    setBusy(false);
  }

  const shown = msgs.length ? msgs : [greeting];
  const lastChips = [...shown].reverse().find((m) => m.role !== "user")?.meta?.chips;

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="fixed z-40 right-4 bottom-24 sm:bottom-8 flex items-center gap-2 h-12 px-5 rounded-full bg-brand text-white font-bold shadow-xl shadow-brand/40 hover:brightness-110 active:scale-95 transition">
          💬 {si ? "අහලා book කරන්න" : "Ask & book"}
        </button>
      )}
      {open && (
        <div className="fixed z-50 inset-0 sm:inset-auto sm:right-6 sm:bottom-6 sm:w-[400px] sm:h-[640px] sm:max-h-[85dvh] flex flex-col bg-[var(--bg)] sm:rounded-3xl sm:border sm:border-line shadow-2xl overflow-hidden overscroll-contain" style={vp ? { top: vp.top, height: vp.h, bottom: "auto" } : undefined} role="dialog" aria-label="Chat">
          <div className="flex items-center gap-3 p-3.5 border-b border-line bg-card">
            <span className="size-10 rounded-full overflow-hidden bg-soft flex items-center justify-center text-xl shrink-0">{logo ? <img src={logo} alt="" className="size-full object-cover" /> : icon}</span>
            <div className="min-w-0 flex-1"><div className="font-display font-bold truncate">{name}</div><div className="text-xs text-green-600 dark:text-green-400 font-semibold">● {si ? "AI assistant · ඉක්මනින් reply කරනවා" : "AI assistant · replies instantly"}</div></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="size-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-lg">✕</button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2">
            {shown.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%] space-y-1.5">
                  {m.role === "owner" && <div className="text-[10px] font-bold text-muted px-1">{name} · {si ? "Shop එකෙන්" : "from the shop"}</div>}
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${m.role === "user" ? "bg-brand text-white rounded-tr-md" : m.role === "owner" ? "bg-sky-500/15 border border-sky-500/30 rounded-tl-md" : "bg-card border border-line rounded-tl-md"}`}>
                    <Text s={m.content} />
                  </div>
                  {(m.meta?.booking || m.meta?.order) && (() => {
                    const c = (m.meta.booking ?? m.meta.order)!;
                    return (
                      <a href={m.meta.booking ? `/b/${c.token}` : `/o/${c.token}`} className="block rounded-2xl border-[1.5px] border-green-500/50 bg-green-500/10 px-3.5 py-2.5 text-sm">
                        <b>✅ {m.meta.booking ? (si ? "Book කළා!" : "Booked!") : (si ? "Order එක ලැබුණා!" : "Order placed!")}</b>
                        <div className="whitespace-pre-line mt-0.5">{c.summary}</div>
                        <div className="text-brand font-bold text-xs mt-1">{m.meta.booking ? (si ? "බලන්න / වෙනස් කරන්න →" : "View / change →") : (si ? "Order එක බලන්න →" : "View order →")}</div>
                      </a>
                    );
                  })()}
                </div>
              </div>
            ))}
            {busy && <div className="flex"><div className="bg-card border border-line rounded-2xl rounded-tl-md px-4 py-3 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${i * .15}s` }} />)}</div></div>}
            {!busy && lastChips && lastChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {lastChips.map((c) => <button key={c} type="button" onClick={() => send(c)} className="h-8 px-3 rounded-full border-[1.5px] border-brand text-brand text-xs font-bold hover:bg-brand hover:text-white transition">{c}</button>)}
              </div>
            )}
            {err && <div className="text-xs text-red-500 px-1">{err}</div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="shrink-0 flex items-center gap-2 p-3 border-t border-line bg-card" style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder={si ? "Message එකක් ලියන්න…" : "Type a message…"} className="flex-1 h-11 px-4 rounded-full bg-[var(--bg)] border border-line outline-none focus:border-brand text-base sm:text-sm" />
            <button disabled={busy || !text.trim()} className="shrink-0 size-11 rounded-full bg-brand text-white font-bold disabled:opacity-40" aria-label="Send">➤</button>
          </form>
          <div className="shrink-0 text-[10px] text-muted text-center pb-1.5 bg-card">{si ? "AI එකට වැරදෙන්න පුළුවන් · වැදගත් දේවල් shop එකෙන් confirm කරගන්න" : "AI can make mistakes · confirm important details with the shop"}</div>
        </div>
      )}
    </>
  );
}
