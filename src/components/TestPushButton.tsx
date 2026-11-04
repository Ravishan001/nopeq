"use client";
import { useState } from "react";
import { sendTestPush } from "@/app/dashboard/notify-actions";

export function TestPushButton({ label }: { label: string }) {
  const [res, setRes] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-ghost h-9 text-sm" onClick={async () => { setRes("…"); const r = await sendTestPush(); setRes(r.sent ? `🔔 ${r.sent}` : `0 ❌ ${r.error ?? ""}`); }}>{label}</button>
      {res && <span className="text-sm break-all">{res}</span>}
    </div>
  );
}
