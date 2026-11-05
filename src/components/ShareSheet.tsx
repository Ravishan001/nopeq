"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useLang } from "./I18nProvider";

function useShare(url: string, name: string) {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); },
    wa: `https://wa.me/?text=${encodeURIComponent(`Book your time at ${name}: ${url}`)}`,
  };
}

/** QR with the business logo in the middle (high error correction keeps it scannable). Tap → poster. */
function Qr({ url, logo, size }: { url: string; logo: string | null; size: number }) {
  const slug = url.split("/").pop() ?? "";
  return (
    <Link href="/dashboard/poster" title="Open poster" className="block bg-white rounded-2xl p-3 w-fit mx-auto hover:scale-[1.02] transition">
      <QRCodeSVG value={url} size={size} level="H" fgColor="#0B0F1C"
        imageSettings={logo ? { src: `/api/logo/${slug}`, height: Math.round(size * 0.23), width: Math.round(size * 0.23), excavate: true } : undefined} />
    </Link>
  );
}

function Actions({ url, name, big = false }: { url: string; name: string; big?: boolean }) {
  const si = useLang() === "si";
  const s = useShare(url, name);
  return (
    <div className={`grid ${big ? "grid-cols-2" : "grid-cols-3"} gap-2 mt-4`}>
      <button className="btn-ghost h-11 text-sm" onClick={s.copy}>{s.copied ? "✓ Copied" : si ? "Copy link" : "Copy link"}</button>
      <a className={`${big ? "btn-ghost" : "btn-ghost"} h-11 text-sm`} href={s.wa} target="_blank">WhatsApp</a>
      <Link className={`btn h-11 text-sm ${big ? "col-span-2" : ""}`} href="/dashboard/poster">🖨️ {big ? (si ? "Poster එක (print / download)" : "Poster (print / download)") : "Poster"}</Link>
    </div>
  );
}

/** Small "QR" button → bottom sheet with a big scannable QR (phones). */
export function ShareButton({ url, name, logo = null }: { url: string; name: string; logo?: string | null }) {
  const si = useLang() === "si";
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost h-10 px-3 text-sm" aria-label="Show QR code">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3" /></svg>
        QR
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="w-full sm:max-w-sm bg-card rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1.5 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4 sm:hidden" />
            <h3 className="font-display font-bold text-xl">{si ? "Booking page එක share කරන්න" : "Share your booking page"}</h3>
            <p className="text-sm text-muted mt-1">{si ? "Customers scan කරලා book කරනවා. Login ඕන නෑ." : "Customers scan this to book — no login needed"}</p>
            <div className="mt-5"><Qr url={url} logo={logo} size={210} /></div>
            <p className="text-xs text-muted mt-2">{si ? "QR එක tap කරලා poster එක open කරන්න" : "Tap the QR to open the poster"}</p>
            <div className="font-semibold mt-3 break-all">{url.replace(/^https?:\/\//, "")}</div>
            <Actions url={url} name={name} big />
          </div>
        </div>
      )}
    </>
  );
}

/** Big QR panel (computer sidebar). */
export function QrCard({ url, name, logo = null }: { url: string; name: string; logo?: string | null }) {
  const si = useLang() === "si";
  return (
    <div className="card p-5 text-center">
      <Qr url={url} logo={logo} size={150} />
      <div className="font-display font-bold mt-3">{si ? "Scan කරලා book කරන්න" : "Scan to book"}</div>
      <div className="text-sm text-muted break-all">{url.replace(/^https?:\/\//, "")}</div>
      <Actions url={url} name={name} />
    </div>
  );
}

/** Compact link card with a small QR (phones, below the board). */
export function LinkCard({ url, name, logo = null }: { url: string; name: string; logo?: string | null }) {
  const si = useLang() === "si";
  return (
    <div className="card p-4">
      <div className="flex gap-4 items-center">
        <Link href="/dashboard/poster" className="bg-white p-1.5 rounded-xl shrink-0"><QRCodeSVG value={url} size={72} level="H" imageSettings={logo ? { src: `/api/logo/${url.split("/").pop()}`, height: 18, width: 18, excavate: true } : undefined} /></Link>
        <div className="min-w-0">
          <div className="font-semibold">{si ? "ඔයාගේ booking link එක" : "Your booking link"}</div>
          <div className="text-sm text-muted break-all">{url.replace(/^https?:\/\//, "")}</div>
        </div>
      </div>
      <Actions url={url} name={name} />
    </div>
  );
}
