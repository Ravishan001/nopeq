"use client";
import { useRef, useState } from "react";
import { uploadRef } from "@/app/[slug]/upload-action";
import { IMAGE_TYPES, shrinkImage } from "@/lib/image";

/** Customer photo upload (reference / design photos). Shows thumbnails, max `max` photos. */
export function PhotoPicker({ businessId, urls, onChange, max = 3, si, title, sub }: {
  businessId: string; urls: string[]; onChange: (u: string[]) => void; max?: number; si: boolean; title: string; sub: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(files: FileList) {
    setErr(null);
    const list = Array.from(files).slice(0, max - urls.length);
    if (!list.length) return;
    setBusy(true);
    const out = [...urls];
    for (const f of list) {
      if (f.type && !IMAGE_TYPES.includes(f.type)) { setErr(si ? "Photo එකක් විතරක් දාන්න" : "Photos only"); continue; }
      const blob = await shrinkImage(f, 1400);
      const fd = new FormData();
      fd.set("businessId", businessId);
      fd.set("file", new File([blob], "ref.webp", { type: blob.type || "image/webp" }));
      try {
        const r = await uploadRef(fd);
        if (r.url) out.push(r.url);
        else setErr(r.error === "size" ? (si ? "Photo එක ලොකු වැඩියි" : "Photo is too large") : (si ? "Upload වුණේ නෑ, ආයෙ try කරන්න" : "Upload failed, try again"));
      } catch {
        setErr(si ? "Upload වුණේ නෑ, ආයෙ try කරන්න" : "Upload failed, try again");
      }
    }
    onChange(out);
    setBusy(false);
  }

  return (
    <div>
      <div className="rounded-2xl border-2 border-dashed border-brand/50 p-3 flex items-center gap-2.5 flex-wrap">
        {urls.map((u) => (
          <div key={u} className="relative size-16 rounded-xl overflow-hidden bg-black/10">
            <img src={u} alt="" className="size-full object-cover" />
            <button type="button" aria-label={si ? "අයින් කරන්න" : "Remove"} onClick={() => onChange(urls.filter((x) => x !== u))}
              className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/70 text-white text-xs leading-none">✕</button>
          </div>
        ))}
        {urls.length < max && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex items-center gap-2.5 text-left min-w-0">
            <span className="size-16 rounded-xl bg-soft flex items-center justify-center text-2xl shrink-0">{busy ? "⏳" : "📷"}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-sm">{busy ? (si ? "Upload වෙනවා…" : "Uploading…") : `＋ ${title}`}</span>
              <span className="block text-xs text-muted">{sub}</span>
            </span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple={max > 1} hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}
