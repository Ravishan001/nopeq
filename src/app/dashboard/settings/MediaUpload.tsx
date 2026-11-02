"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/components/I18nProvider";
import { setMedia } from "../actions";

export function MediaUpload({ field, label, url, userId, round }: { field: "logo_url" | "cover_url"; label: string; url: string | null; userId: string; round?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(f: File) {
    setErr(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) return setErr("PNG / JPG / WEBP only");
    if (f.size > 3 * 1024 * 1024) return setErr("Max 3 MB");
    setBusy(true);
    const supabase = createClient();
    const path = `${userId}/${field}-${Date.now()}.${f.type.split("/")[1]}`;
    const { error } = await supabase.storage.from("media").upload(path, f, { upsert: true, contentType: f.type });
    if (error) { setErr(error.message); setBusy(false); return; }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    await setMedia(field, data.publicUrl);
    setPreview(data.publicUrl);
    setBusy(false);
  }

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-4">
        <div className={`${round ? "size-20 rounded-full" : "h-20 w-36 rounded-xl"} bg-black/5 dark:bg-white/10 overflow-hidden flex items-center justify-center text-2xl shrink-0`}>
          {preview ? <img src={preview} alt="" className="size-full object-cover" /> : "📷"}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? "…" : t("upload")}</button>
          {preview && <button type="button" className="btn-ghost" onClick={async () => { await setMedia(field, null); setPreview(null); }}>{t("delete")}</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
      {err && <p className="text-sm text-red-500 mt-1">{err}</p>}
    </div>
  );
}
