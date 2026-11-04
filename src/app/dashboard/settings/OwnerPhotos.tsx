"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image";

/** Owner photo list (product photo, artist portfolio). Uploads to media/<uid>/… then saves the list. */
export function OwnerPhotos({ userId, prefix, urls, max, save, label, small }: {
  userId: string; prefix: string; urls: string[]; max: number; save: (urls: string[]) => Promise<void>; label: string; small?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [list, setList] = useState(urls);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const size = small ? "size-14" : "size-16";

  async function add(files: FileList) {
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    const out = [...list];
    for (const f of Array.from(files).slice(0, max - list.length)) {
      const blob = await shrinkImage(f, 1200);
      const path = `${userId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
      const { error } = await supabase.storage.from("media").upload(path, blob, { contentType: blob.type || "image/webp", cacheControl: "31536000" });
      if (error) { setErr(error.message); continue; }
      out.push(supabase.storage.from("media").getPublicUrl(path).data.publicUrl);
    }
    setList(out);
    await save(out);
    setBusy(false);
  }
  async function remove(u: string) {
    const out = list.filter((x) => x !== u);
    setList(out);
    await save(out);
  }

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2 items-center">
        {list.map((u) => (
          <div key={u} className={`relative ${size} rounded-xl overflow-hidden bg-black/10`}>
            <img src={u} alt="" className="size-full object-cover" />
            <button type="button" onClick={() => remove(u)} aria-label="Remove" className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/70 text-white text-xs">✕</button>
          </div>
        ))}
        {list.length < max && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${size} rounded-xl border-2 border-dashed border-line text-xl text-muted hover:border-brand hover:text-brand`}>
            {busy ? "⏳" : "＋"}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple={max > 1} hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}
