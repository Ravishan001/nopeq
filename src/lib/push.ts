import "server-only";
import webpush from "web-push";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

let ready = false;
const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "");

/** Do the VAPID public + private keys belong together? (common copy/paste mistake) */
export function vapidCheck(): { ok: boolean; reason?: string } {
  const pub = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY), priv = clean(process.env.VAPID_PRIVATE_KEY);
  if (!pub || !priv) return { ok: false, reason: "missing" };
  try {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(priv, "base64url"));
    if (ecdh.getPublicKey("base64url") !== pub) return { ok: false, reason: "public/private keys don't match (swapped?)" };
  } catch {
    return { ok: false, reason: "private key is not valid" };
  }
  const subj = clean(process.env.VAPID_SUBJECT) || "mailto:hello@nopeq.com";
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subj)) return { ok: false, reason: "VAPID_SUBJECT must look like mailto:you@gmail.com" };
  return { ok: true };
}

function init() {
  if (ready) return true;
  if (!vapidCheck().ok) return false;
  webpush.setVapidDetails(clean(process.env.VAPID_SUBJECT) || "mailto:hello@nopeq.com", clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY), clean(process.env.VAPID_PRIVATE_KEY));
  ready = true;
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Push to every device an owner has enabled. Dead subscriptions are removed. */
export async function pushToOwner(admin: SupabaseClient, ownerId: string, payload: PushPayload, errors?: string[]) {
  if (!init()) { errors?.push(`keys: ${vapidCheck().reason}`); return 0; }
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("owner_id", ownerId);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      const body = (e as { body?: string }).body ?? (e as Error).message;
      errors?.push(`${code ?? "?"} ${String(body).slice(0, 120)}`);
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push", code, body);
    }
  }));
  return sent;
}
