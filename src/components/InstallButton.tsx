"use client";
import { useEffect, useState } from "react";
import { useLang } from "./I18nProvider";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const TEXT = {
  si: {
    btn: "App එක install කරන්න",
    short: "Install",
    iosTitle: "iPhone එකට NopeQ app එක දාගන්න",
    ios: ["පහළ (හෝ උඩ) තියෙන Share button එක ⬆️ click කරන්න", "\"Add to Home Screen\" ➕ තෝරන්න", "උඩ දකුණේ \"Add\" click කරන්න"],
    iosNote: "Safari එකෙන් විතරයි මේක කරන්න පුළුවන්. Chrome/Gmail එක ඇතුළේ නම්, link එක Safari එකෙන් open කරන්න.",
    otherTitle: "App එක install කරන්න",
    other: ["Browser menu එක (⋮) open කරන්න", "\"Install app\" හෝ \"Add to Home screen\" තෝරන්න"],
    ok: "හරි",
  },
  en: {
    btn: "Install the app",
    short: "Install",
    iosTitle: "Add NopeQ to your iPhone",
    ios: ["Tap the Share button ⬆️ at the bottom (or top)", "Choose \"Add to Home Screen\" ➕", "Tap \"Add\" in the top-right corner"],
    iosNote: "This only works in Safari. If you're inside Chrome or Gmail, open the link in Safari.",
    otherTitle: "Install the app",
    other: ["Open the browser menu (⋮)", "Choose \"Install app\" or \"Add to Home screen\""],
    ok: "OK",
  },
};

export function InstallButton({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const lang = useLang();
  const tx = TEXT[lang];
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(true); // hidden until we know
  const [help, setHelp] = useState<"ios" | "other" | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(!!standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;

  async function click() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setPrompt(null);
    } else setHelp(ios ? "ios" : "other");
  }

  return (
    <>
      <button onClick={click} className={`${compact ? "btn-ghost h-9 px-3 text-sm" : "btn"} ${className}`} aria-label={tx.btn}>
        📲 {compact ? tx.short : tx.btn}
      </button>
      {help && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setHelp(null)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <img src="/icons/icon-192.png" alt="" className="size-12 rounded-xl" />
              <h2 className="font-display font-bold text-lg">{help === "ios" ? tx.iosTitle : tx.otherTitle}</h2>
            </div>
            <ol className="mt-5 space-y-3">
              {(help === "ios" ? tx.ios : tx.other).map((s, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="size-6 shrink-0 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {help === "ios" && <p className="text-xs text-muted mt-4">{tx.iosNote}</p>}
            <button className="btn w-full mt-5" onClick={() => setHelp(null)}>{tx.ok}</button>
          </div>
        </div>
      )}
    </>
  );
}
