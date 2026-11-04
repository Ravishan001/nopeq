"use client";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/dashboard/notify-actions";
import { useT } from "./I18nProvider";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

export function PushToggle() {
  const t = useT();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !key) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [key]);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key!) });
      const res = await savePushSubscription(s.toJSON(), navigator.userAgent);
      setState(res.ok ? "on" : "off");
      if (res.ok) { const r = await sendTestPush(); setMsg(r.sent ? t("push_test_sent") : null); }
    } catch {
      setMsg(t("err_generic"));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const s = await reg?.pushManager.getSubscription();
    if (s) { await removePushSubscription(s.endpoint); await s.unsubscribe(); }
    setState("off"); setBusy(false);
  }

  const on = state === "on";
  const canToggle = state === "on" || state === "off";
  return (
    <div className="flex items-center gap-4">
      <div className="size-11 rounded-2xl bg-soft flex items-center justify-center text-xl shrink-0">🔔</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{t("push_title")}</div>
        <div className="text-sm text-muted">
          {on ? t("push_on") : state === "denied" ? t("push_denied") : state === "ios-install" ? t("push_ios") : state === "unsupported" ? t("push_unsupported") : t("push_sub")}
        </div>
        {msg && <div className="text-sm text-green-600 dark:text-green-400 mt-1">{msg}</div>}
      </div>
      {canToggle && (
        <button
          role="switch"
          aria-checked={on}
          aria-label={t("push_title")}
          disabled={busy}
          onClick={on ? disable : enable}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-brand" : "bg-black/15 dark:bg-white/15"}`}
        >
          <span className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : ""}`} />
        </button>
      )}
    </div>
  );
}
