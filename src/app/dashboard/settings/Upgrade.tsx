"use client";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image";
import { formatMoney } from "@/lib/countries";
import { attachSlip, createUpgrade } from "../billing-actions";

type Bank = { account_name: string | null; bank: string | null; branch: string | null; account_no: string | null; note: string | null };
type Open = { reference: string; months: number; amount: number; currency: string } | null;

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="ml-2 text-[11px] font-extrabold text-brand" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}>
      {ok ? "COPIED ✓" : "COPY"}
    </button>
  );
}

/** Pick 1 / 12 months → get a reference → bank details → upload the slip. */
export function Upgrade({ prices, currency, bank, open, userId, si }: {
  prices: { m1: number; m12: number }; currency: string; bank: Bank; open: Open; userId: string; si: boolean;
}) {
  const money = (n: number, c = currency) => formatMoney(n, c, si ? "si-LK" : "en");
  const [months, setMonths] = useState<1 | 12>(open?.months === 12 ? 12 : 1);
  const [req, setReq] = useState<Open>(open);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const go = (m: 1 | 12) => { setMonths(m); setErr(null); start(async () => {
    const r = await createUpgrade(m);
    if (r.reference) setReq({ reference: r.reference, months: m, amount: r.amount!, currency: r.currency! });
    else setErr(r.error === "too_many" ? (si ? "දැනටමත් check කරන්න තියෙන payments තියෙනවා." : "You already have payments waiting to be checked.") : (si ? "මොකක් හරි වැරදුණා. ආයෙ try කරන්න." : "Something went wrong. Try again."));
  }); };

  async function upload(f: File) {
    if (!req) return;
    setErr(null);
    setPreview(URL.createObjectURL(f));
    start(async () => {
      const blob = await shrinkImage(f, 1600, 0.85);
      const path = `${userId}/${req.reference}-${Date.now()}.webp`;
      const { error } = await createClient().storage.from("slips").upload(path, blob, { contentType: blob.type || "image/webp" });
      if (error) { setErr(error.message); return; }
      const r = await attachSlip(req.reference, path);
      if (r.ok) setDone(true); else setErr(si ? "Slip එක save වුණේ නෑ" : "Couldn't save the slip");
    });
  }

  if (done) return (
    <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
      ⏳ <b>{si ? "Activate කරනකම් ඉන්නවා" : "Waiting for activation"}</b>
      <p className="text-muted mt-1">{si ? "සාමාන්‍යයෙන් පැය කීපයකින් activate කරනවා. Notification එකක් එයි." : "We usually activate within a few hours. You'll get a notification."}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 p-1 rounded-xl bg-black/5 dark:bg-white/5">
        {([1, 12] as const).map((m) => (
          <button key={m} type="button" disabled={busy} onClick={() => (req ? go(m) : setMonths(m))}
            className={`h-11 rounded-lg text-sm font-bold transition ${months === m ? "bg-card shadow text-fg" : "text-muted"}`}>
            {m === 1 ? `${si ? "මාසයකට" : "Monthly"} · ${money(prices.m1)}` : `${si ? "අවුරුද්දකට" : "Yearly"} · ${money(prices.m12)}`}
          </button>
        ))}
      </div>
      {months === 12 && <p className="text-xs text-green-600 dark:text-green-400 font-semibold -mt-2">🎁 {si ? "මාස 2ක් free" : "2 months free"}</p>}

      {!req ? (
        <button type="button" className="btn w-full" disabled={busy} onClick={() => go(months)}>{busy ? "…" : `🏦 ${si ? "Bank transfer එකෙන් ගෙවන්න" : "Pay by bank transfer"}`}</button>
      ) : (
        <>
          <div className="rounded-2xl border border-line divide-y divide-[var(--line)] text-sm">
            {[
              [si ? "Account name" : "Account name", bank.account_name],
              ["Bank", bank.bank], ["Branch", bank.branch], ["Account no.", bank.account_no],
              [si ? "ගාණ" : "Amount", money(req.amount, req.currency)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2.5">
                <span className="text-muted">{k}</span>
                <b className="text-right">{v || "—"}{k === "Account no." && v ? <Copy text={v} /> : null}</b>
              </div>
            ))}
            <div className="flex justify-between gap-3 px-4 py-2.5"><span className="text-muted">Reference</span><b className="text-brand">{req.reference}<Copy text={req.reference} /></b></div>
          </div>
          {!bank.account_no && <p className="text-xs text-amber-600 dark:text-amber-400">{si ? "Bank details තාම දාලා නෑ. WhatsApp කරලා අහන්න." : "Bank details aren't set yet — please ask us on WhatsApp."}</p>}
          {bank.note && <p className="text-xs text-muted">{bank.note}</p>}
          <p className="text-xs text-muted">{si ? <>Transfer note එකේ <b className="text-fg">{req.reference}</b> දාන්න. ඊට පස්සේ slip එකේ photo එක upload කරන්න.</> : <>Put <b className="text-fg">{req.reference}</b> in the transfer note, then upload a photo of the slip.</>}</p>
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-brand/50 p-3 flex items-center gap-3 text-left hover:bg-soft transition">
            <span className="size-16 rounded-xl bg-soft overflow-hidden flex items-center justify-center text-2xl shrink-0">{preview ? <img src={preview} alt="" className="size-full object-cover" /> : "🧾"}</span>
            <span><b className="block text-sm">{busy ? (si ? "Upload වෙනවා…" : "Uploading…") : (si ? "Payment slip එක upload කරන්න" : "Upload payment slip")}</b><span className="text-xs text-muted">{si ? "Photo හරි screenshot හරි" : "Photo or screenshot"}</span></span>
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </>
      )}
      {err && <p className="text-sm text-red-500">{err}</p>}
    </div>
  );
}
