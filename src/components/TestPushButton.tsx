"use client";
import { useState } from "react";
import { sendTestPush } from "@/app/dashboard/notify-actions";

export function TestPushButton({ label }: { label: string }) {
  const [res, setRes] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button className="btn-ghost h-9 text-sm" onClick={async () => { setRes("…"); const r = await sendTestPush(); setRes(r.sent ? `🔔 ${r.sent}` : "0 ❌"); }}>{label}</button>
      {res && <span className="text-sm">{res}</span>}
    </div>
  );
}
