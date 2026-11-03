import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

let ready = false;
function init() {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@nopeq.com", pub, priv);
  ready = true;
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Push to every device an owner has enabled. Dead subscriptions are removed. */
export async function pushToOwner(admin: SupabaseClient, ownerId: string, payload: PushPayload) {
  if (!init()) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("owner_id", ownerId);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push", code, e);
    }
  }));
  return sent;
}
