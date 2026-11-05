"use client";
import { useEffect, useState } from "react";
import { InstallButton } from "@/components/InstallButton";

/** After upgrading: how to get the app icon with the business logo (iPhone needs a reinstall). */
export function Reinstall({ logo, name, si }: { logo: string | null; name: string; si: boolean }) {
  const [os, setOs] = useState<"ios" | "android">("ios");
  useEffect(() => { if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) setOs("android"); }, []);
  const steps = os === "ios"
    ? (si
      ? ["පරණ NopeQ icon එක තදකරලා අල්ලන් ඉඳලා → Remove App", "Safari එකෙන් nopeq.vercel.app/dashboard open කරන්න", "Share ⬆︎ → Add to Home Screen", "Dashboard එකේ notifications ආයෙ on කරන්න"]
      : ["Press and hold the old NopeQ icon → Remove App", "Open nopeq.vercel.app/dashboard in Safari", "Tap Share ⬆︎ → Add to Home Screen", "Turn notifications on again in the dashboard"])
    : (si
      ? ["ටික දවසකින් icon එක auto මාරු වෙන්න පුළුවන්", "නැත්නම්: පරණ icon එක uninstall කරන්න", "Chrome එකෙන් dashboard එක open කරලා පහළ button එක ඔබන්න", "Notifications ආයෙ on කරන්න"]
      : ["The icon may update by itself within a few days", "If not: uninstall the old NopeQ app", "Open the dashboard in Chrome and tap the button below", "Turn notifications on again"]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-4">
        <div className="text-center"><img src="/icons/icon-192.png" alt="" className="size-16 rounded-2xl" /><div className="text-xs text-muted mt-1">NopeQ</div></div>
        <span className="text-brand text-2xl">→</span>
        <div className="text-center">
          <span className="size-16 rounded-2xl overflow-hidden bg-black/10 flex items-center justify-center text-2xl">{logo ? <img src={logo} alt="" className="size-full object-cover" /> : "📷"}</span>
          <div className="text-xs text-muted mt-1 max-w-20 truncate">{name}</div>
        </div>
      </div>
      {!logo && <p className="text-xs text-amber-600 dark:text-amber-400 text-center">{si ? "මුලින් Profile tab එකෙන් logo එකක් දාන්න." : "Add a logo in the Profile tab first."}</p>}
      <div className="flex gap-2">
        {(["ios", "android"] as const).map((x) => <button key={x} type="button" onClick={() => setOs(x)} className={`chip ${os === x ? "chip-on" : ""}`}>{x === "ios" ? "iPhone" : "Android"}</button>)}
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm"><span className="size-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span><span>{s}</span></li>
        ))}
      </ol>
      <p className="text-xs text-muted">{si ? "iPhone එකේ icon එක install කරපු වෙලාවේ තිබ්බ එකමයි තියෙන්නේ, ඒ නිසා එක පාරක් reinstall කරන්න ඕන." : "iPhone keeps the icon from install time, so reinstall once."}</p>
      <InstallButton className="w-full" />
    </div>
  );
}
