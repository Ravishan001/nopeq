"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/components/I18nProvider";
import { setMedia } from "../actions";

/** Shrink big phone photos before upload so pages load fast (logo 512px, cover 1600px, WebP). */
async function shrink(file: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/webp", 0.85));
}

export function MediaUpload({ field, label, url, userId, round }: { field: "logo_url" | "cover_url"; label: string; url: string | null; userId: string; round?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(f: File) {
    setErr(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) return setErr("PNG / JPG / WEBP only");
    if (f.size > 15 * 1024 * 1024) return setErr("Max 15 MB");
    setBusy(true);
    const supabase = createClient();
    let body: Blob = f;
    try { body = await shrink(f, field === "logo_url" ? 512 : 1600); } catch { /* keep original */ }
    if (body.size > 3 * 1024 * 1024) { setBusy(false); return setErr("Max 3 MB"); }
    const ext = body.type === "image/webp" ? "webp" : f.type.split("/")[1];
    const path = `${userId}/${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, body, { upsert: true, contentType: body.type || f.type, cacheControl: "31536000" });
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
