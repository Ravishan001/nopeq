import { requireBusiness } from "@/lib/business";
import { adminClient } from "@/lib/supabase/admin";
import { TestPushButton } from "./TestPushButton";
import { vapidCheck } from "@/lib/push";

/** Server-side health check so the owner can see exactly what's missing. */
export async function NotifyStatus({ lang }: { lang: "si" | "en" }) {
  const { supabase, user } = await requireBusiness();
  const si = lang === "si";
  const admin = adminClient();
  const vc = vapidCheck();
  const vapid = vc.ok;
  const { count, error } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  const dbOk = !error;
  // does the "service role" key really bypass RLS? (anon key pasted by mistake = sees 0 rows)
  let adminOk = false;
  if (admin) {
    const r = await admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    adminOk = !r.error && (r.count ?? 0) === (count ?? 0);
  }
  const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);
  const rows: [boolean, string][] = [
    [dbOk, si ? "Database (003 migration)" : "Database (003 migration)"],
    [vapid, (si ? "Push keys (VAPID) Vercel එකේ" : "Push keys (VAPID) in Vercel") + (vc.ok ? "" : ` — ${vc.reason}`)],
    [!!admin && adminOk, (si ? "SUPABASE_SERVICE_ROLE_KEY Vercel එකේ" : "SUPABASE_SERVICE_ROLE_KEY in Vercel") + (!admin ? "" : adminOk ? "" : " — wrong key (anon / publishable?)")],
    [(count ?? 0) > 0, si ? `On කරපු devices: ${count ?? 0}` : `Devices turned on: ${count ?? 0}`],
  ];
  return (
    <div className="border-t border-line pt-4">
      <div className="text-sm font-semibold mb-2">Setup check <span className="text-xs text-muted font-normal">· v {version}</span></div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {rows.map(([ok, label]) => (
          <li key={label} className="flex items-center gap-2"><span>{ok ? "✅" : "❌"}</span><span className={ok ? "text-muted" : "font-semibold"}>{label}</span></li>
        ))}
      </ul>
      {dbOk && admin && (count ?? 0) > 0 && <div className="mt-3"><TestPushButton label={si ? "Test notification එකක් යවන්න" : "Send a test notification"} /></div>}
    </div>
  );
}
