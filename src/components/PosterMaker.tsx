"use client";
import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";

type Theme = "dark" | "light" | "brand";
type Format = "a4" | "square";
export type PosterInfo = {
  url: string; name: string; slug: string; icon: string; logo: string | null; tagline: string;
  color: string; branding: boolean; hours: string | null; si: boolean; orders: boolean;
};

const THEMES: Record<Theme, { bg: [string, string]; fg: string; mu: string; band: string; bandFg: string }> = {
  dark: { bg: ["#0B0F1C", "#1a1530"], fg: "#ffffff", mu: "#9aa4b8", band: "", bandFg: "#ffffff" },
  light: { bg: ["#ffffff", "#f4f5f8"], fg: "#0D1224", mu: "#5b6275", band: "", bandFg: "#ffffff" },
  brand: { bg: ["", ""], fg: "#ffffff", mu: "rgba(255,255,255,.82)", band: "#0B0F1C", bandFg: "#ffffff" },
};

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16); const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, max: number) {
  let px = start; ctx.font = font(px);
  while (ctx.measureText(text).width > max && px > 20) { px -= 2; ctx.font = font(px); }
  return px;
}
// Some phones (system Sinhala fallback fonts) report a wrong measureText width, so
// canvas "center" alignment drifts right and the line gets cut off. Draw the line on a
// scratch canvas, find where the ink really is, then place that centred and scaled to fit.
function inkCentered(ctx: CanvasRenderingContext2D, text: string, font: string, color: string, cx: number, y: number, size: number, maxW: number) {
  const pad = Math.ceil(size * 0.6), w = Math.ceil(size * text.length * 1.2) + pad * 2, h = Math.ceil(size * 2.2);
  const s = document.createElement("canvas"); s.width = w; s.height = h;
  const sc = s.getContext("2d", { willReadFrequently: true })!;
  sc.font = font; sc.fillStyle = color; sc.textAlign = "left"; sc.textBaseline = "alphabetic";
  const base = Math.round(size * 1.5);
  sc.fillText(text, pad, base);
  const d = sc.getImageData(0, 0, w, h).data;
  let x0 = w, x1 = -1;
  for (let x = 0; x < w; x++) for (let yy = 0; yy < h; yy++) if (d[(yy * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; x1 = x; break; }
  if (x1 < 0) { ctx.font = font; ctx.fillStyle = color; ctx.fillText(text, cx, y); return; }
  const inkW = x1 - x0 + 1, k = Math.min(1, maxW / inkW);
  ctx.drawImage(s, x0, 0, inkW, h, cx - (inkW * k) / 2, y - base * k, inkW * k, h * k);
}
const load = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/** Ready-made shop-front poster: logo, name, "Scan to book", QR with the logo in the middle. Download as PNG or print. */
export function PosterMaker({ p }: { p: PosterInfo }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [format, setFormat] = useState<Format>("a4");
  const [ready, setReady] = useState(false);
  const [logoOk, setLogoOk] = useState<boolean | null>(p.logo ? null : false);
  const out = useRef<HTMLCanvasElement>(null);
  const qrWrap = useRef<HTMLDivElement>(null);
  const logoSrc = `/api/logo/${p.slug}`;

  useEffect(() => { if (p.logo) load(logoSrc).then((i) => setLogoOk(!!i)); }, [p.logo, logoSrc]);

  const draw = useCallback(async () => {
    const c = out.current; const qr = qrWrap.current?.querySelector("canvas");
    if (!c || !qr || logoOk === null) return;
    await document.fonts.ready;
    const W = 1240, H = format === "a4" ? 1754 : 1240;
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    const t = THEMES[theme];
    const sq = format === "square";

    // background
    const g = ctx.createLinearGradient(0, 0, W, H);
    if (theme === "brand") { g.addColorStop(0, p.color); g.addColorStop(1, shade(p.color, 0.62)); }
    else { g.addColorStop(0, t.bg[0]); g.addColorStop(1, t.bg[1]); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // soft glow
    if (theme !== "light") {
      const r = ctx.createRadialGradient(W * 0.85, H * 0.12, 10, W * 0.85, H * 0.12, W * 0.7);
      r.addColorStop(0, theme === "brand" ? "rgba(255,255,255,.18)" : `${p.color}55`); r.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

    // logo + name
    // layout (px on a 1240-wide canvas); A4 content ends above the bottom band
    const S = sq
      ? { top: 75, logo: 140, gName: 82, name: 66, gTag: 48, tag: 28, gHead: 96, head: 88, gSin: 58, sin: 40, gQr: 54, qr: 450, pad: 32, gUrl: 68, url: 38, gPro: 48, pro: 27 }
      : { top: 90, logo: 190, gName: 100, name: 88, gTag: 56, tag: 34, gHead: 115, head: 112, gSin: 68, sin: 48, gQr: 56, qr: 560, pad: 40, gUrl: 82, url: 44, gPro: 56, pro: 32 };
    let y = S.top;
    const L = S.logo;
    const logo = logoOk ? await load(logoSrc) : null;
    ctx.save(); rounded(ctx, W / 2 - L / 2, y, L, L, L * 0.24); ctx.fillStyle = theme === "light" ? "#0B0F1C" : "#ffffff"; ctx.fill(); ctx.clip();
    if (logo) ctx.drawImage(logo, W / 2 - L / 2, y, L, L);
    else { ctx.font = `${L * 0.55}px "Noto Color Emoji", "Apple Color Emoji", sans-serif`; ctx.textBaseline = "middle"; ctx.fillText(p.icon, W / 2, y + L / 2 + 6); ctx.textBaseline = "alphabetic"; }
    ctx.restore();
    y += L + S.gName;
    ctx.fillStyle = t.fg;
    const namePx = fit(ctx, p.name, (px) => `700 ${px}px Sora, "Noto Sans Sinhala", sans-serif`, S.name, W - 160);
    inkCentered(ctx, p.name, `700 ${namePx}px Sora, "Noto Sans Sinhala", sans-serif`, t.fg, W / 2, y, namePx, W - 160);
    y += S.gTag;
    inkCentered(ctx, p.tagline, `500 ${S.tag}px Inter, "Noto Sans Sinhala", sans-serif`, t.mu, W / 2, y, S.tag, W - 160);

    // headline
    y += S.gHead;
    ctx.fillStyle = t.fg;
    fit(ctx, p.orders ? "Scan to order" : "Scan to book", (px) => `700 ${px}px Sora, sans-serif`, S.head, W - 140);
    ctx.fillText(p.orders ? "Scan to order" : "Scan to book", W / 2, y);
    y += S.gSin;
    inkCentered(ctx, p.orders ? "Scan කරලා order කරන්න" : "Scan කරලා book කරන්න",
      `700 ${S.sin}px "Noto Sans Sinhala", "Iskoola Pota", Inter, sans-serif`,
      theme === "brand" ? "#ffffff" : p.color, W / 2, y, S.sin, W - 200);

    // QR card
    const Q = S.qr, pad = S.pad;
    y += S.gQr;
    const qx = W / 2 - Q / 2 - pad;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
    rounded(ctx, qx, y, Q + pad * 2, Q + pad * 2, 54); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.restore();
    ctx.drawImage(qr, qx + pad, y + pad, Q, Q);
    // corner accents
    ctx.strokeStyle = theme === "brand" ? "#ffffff" : p.color; ctx.lineWidth = 10; ctx.lineCap = "round";
    const a = 70, o = 22, x0 = qx - o, y0 = y - o, x1 = qx + Q + pad * 2 + o, y1 = y + Q + pad * 2 + o;
    for (const [sx, sy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(sx, sy + dy * a); ctx.lineTo(sx, sy); ctx.lineTo(sx + dx * a, sy); ctx.stroke();
    }
    y += Q + pad * 2 + S.gUrl;

    // link + promises
    ctx.fillStyle = t.fg;
    fit(ctx, p.url.replace(/^https?:\/\//, ""), (px) => `700 ${px}px Inter, sans-serif`, S.url, W - 140);
    ctx.fillText(p.url.replace(/^https?:\/\//, ""), W / 2, y);
    y += S.gPro;
    ctx.fillStyle = t.mu; ctx.font = `600 ${S.pro}px Inter, sans-serif`;
    ctx.fillText("No app  ·  No login  ·  Open 24/7", W / 2, y);
    if (p.hours && !sq) { y += 50; fit(ctx, p.hours, (px) => `500 ${px}px Inter, sans-serif`, 28, W - 160); ctx.fillText(p.hours, W / 2, y); }

    // bottom band
    const BH = sq ? 0 : 150;
    if (!sq) {
      ctx.fillStyle = theme === "brand" ? t.band : p.color; ctx.fillRect(0, H - BH, W, BH);
      ctx.fillStyle = "#ffffff"; ctx.font = `700 46px Sora, sans-serif`;
      ctx.fillText(p.orders ? "Order online in 1 minute" : "Book your time in 1 minute", W / 2, H - BH + (p.branding ? 72 : 90));
      if (p.branding) { ctx.font = `500 26px Inter, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillText("powered by NopeQ · Ravion Studio", W / 2, H - 34); }
    } else if (p.branding) {
      ctx.fillStyle = t.mu; ctx.font = `500 22px Inter, sans-serif`; ctx.fillText("powered by NopeQ", W / 2, H - 28);
    }
    setReady(true);
  }, [format, theme, p, logoOk, logoSrc]);

  useEffect(() => { setReady(false); const id = setTimeout(draw, logoOk ? 400 : 60); return () => clearTimeout(id); }, [draw]);

  const download = () => {
    const c = out.current; if (!c) return;
    c.toBlob((b) => { if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${p.slug}-${format === "a4" ? "poster-A4" : "square"}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, "image/png");
  };
  const downloadQr = () => {
    const qr = qrWrap.current?.querySelector("canvas"); if (!qr) return;
    const a = document.createElement("a"); a.href = qr.toDataURL("image/png"); a.download = `${p.slug}-qr.png`; a.click();
  };
  const print = () => {
    const c = out.current; if (!c) return;
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><title>${p.name} poster</title><style>@page{size:${format === "a4" ? "A4" : "auto"};margin:0}html,body{margin:0}img{width:100%;display:block}</style><img src="${c.toDataURL("image/png")}" onload="setTimeout(()=>{print()},200)">`);
    w.document.close();
  };

  const si = p.si;
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
      <div className="card p-3 sm:p-5 flex justify-center bg-black/5 dark:bg-white/5">
        <canvas ref={out} className={`w-full h-auto rounded-xl shadow-2xl transition-opacity ${ready ? "opacity-100" : "opacity-40"} ${format === "a4" ? "max-w-[520px]" : "max-w-[520px]"}`} />
      </div>
      <div className="card p-5 space-y-4 lg:sticky lg:top-4">
        <div>
          <div className="label">{si ? "Size එක" : "Size"}</div>
          <div className="grid grid-cols-2 gap-2">
            {([["a4", si ? "📄 A4 poster (print)" : "📄 A4 poster (print)"], ["square", si ? "⬛ Square (WhatsApp / Insta)" : "⬛ Square (WhatsApp / Insta)"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFormat(k)} className={`chip justify-center ${format === k ? "chip-on" : ""}`}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="label">{si ? "Look එක" : "Style"}</div>
          <div className="grid grid-cols-3 gap-2">
            {([["dark", "🌙 Dark"], ["light", "☀️ Light"], ["brand", "🎨 Colour"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTheme(k)} className={`chip justify-center ${theme === k ? "chip-on" : ""}`}>{l}</button>
            ))}
          </div>
        </div>
        {logoOk === false && <p className="text-xs text-amber-600 dark:text-amber-400">{si ? "Logo එකක් නෑ. Settings → Profile එකෙන් logo එකක් දැම්මම poster එකටයි QR එකටයි එනවා." : "No logo yet — add one in Settings → Profile and it appears on the poster and in the QR."}</p>}
        <button type="button" className="btn w-full" disabled={!ready} onClick={download}>⤓ {si ? "Poster එක download කරන්න" : "Download poster"}</button>
        <button type="button" className="btn-ghost w-full" disabled={!ready} onClick={print}>🖨️ {si ? "Print කරන්න" : "Print"}</button>
        <button type="button" className="btn-ghost w-full h-10 text-sm" onClick={downloadQr}>{si ? "QR එක විතරක් (logo එක්ක)" : "QR only (with logo)"}</button>
        <p className="text-xs text-muted">{si ? "Tip: A4 එක print කරලා laminate කරලා counter එකේ හරි door එකේ හරි ගහන්න. Square එක WhatsApp status / Facebook / Instagram වලට." : "Tip: print the A4 and laminate it for the counter or door. Use the square one for WhatsApp status, Facebook and Instagram."}</p>
      </div>
      <div ref={qrWrap} className="hidden">
        {logoOk !== null && (
          <QRCodeCanvas value={p.url} size={1000} level="H" marginSize={0} fgColor="#0B0F1C"
            imageSettings={logoOk ? { src: logoSrc, height: 230, width: 230, excavate: true } : undefined} />
        )}
      </div>
    </div>
  );
}
