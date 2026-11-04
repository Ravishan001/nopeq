"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/business";
import { pushToOwner } from "@/lib/push";
import { adminClient } from "@/lib/supabase/admin";

const sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export async function savePushSubscription(input: unknown, userAgent: string) {
  const { supabase, user } = await requireBusiness();
  const p = sub.safeParse(input);
  if (!p.success) return { ok: false };
  const { error } = await supabase.from("push_subscriptions").upsert(
    { owner_id: user.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, user_agent: userAgent.slice(0, 200) },
    { onConflict: "endpoint" }
  );
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string) {
  const { supabase } = await requireBusiness();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

export async function sendTestPush() {
  const { user, business } = await requireBusiness();
  const admin = adminClient();
  if (!admin) return { sent: 0, error: "no service role key" };
  const errors: string[] = [];
  const sent = await pushToOwner(admin, user.id, { title: `NopeQ ✅ ${business.name}`, body: "Notifications වැඩ / Notifications are working!", url: "/dashboard" }, errors);
  return { sent, error: errors[0] };
}

export async function setNotifyPrefs(form: FormData) {
  const { supabase, business } = await requireBusiness();
  await supabase.from("businesses").update({
    notify_email: form.get("notify_email") === "on",
    notify_push: form.get("notify_push") === "on",
  }).eq("id", business.id);
  revalidatePath("/dashboard", "layout");
}
