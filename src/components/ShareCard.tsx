"use client";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useT } from "./I18nProvider";

export function ShareCard({ url }: { url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-5 flex gap-5 items-center">
      <div className="bg-white p-2 rounded-xl shrink-0"><QRCodeSVG value={url} size={96} /></div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted">{t("share_link")}</div>
        <a href={url} target="_blank" className="font-semibold break-all hover:text-brand">{url.replace(/^https?:\/\//, "")}</a>
        <div className="flex gap-2 mt-3">
          <button className="btn-ghost h-9 text-sm" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? t("copied") : t("copy")}
          </button>
          <a className="btn-ghost h-9 text-sm" target="_blank" href={`https://wa.me/?text=${encodeURIComponent(url)}`}>WhatsApp</a>
        </div>
      </div>
    </div>
  );
}
