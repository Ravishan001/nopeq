"use server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer reference / design photo (no login). The browser shrinks it first; here we only accept
 * small images for a published business and store them under media/refs/<business>/.
 */
export async function uploadRef(form: FormData): Promise<{ url?: string; error?: string }> {
  const businessId = String(form.get("businessId") ?? "");
  const file = form.get("file");
  if (!z.string().uuid().safeParse(businessId).success || !(file instanceof File)) return { error: "invalid" };
  if (!["image/webp", "image/jpeg", "image/png"].includes(file.type)) return { error: "type" };
  if (file.size > 2.5 * 1024 * 1024) return { error: "size" };
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("is_published", true).maybeSingle();
  if (!biz) return { error: "invalid" };
  const admin = adminClient();
  if (!admin) return { error: "server" };
  const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const path = `refs/${businessId}/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { error: "server" };
  return { url: admin.storage.from("media").getPublicUrl(path).data.publicUrl };
}

/** Only accept photo links that point at our own refs folder for this business. */
export async function isOwnRef(url: string, businessId: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return url.startsWith(`${base}/storage/v1/object/public/media/refs/${businessId}/`) && url.length < 400;
}
