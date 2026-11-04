"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLang } from "@/components/I18nProvider";
import { OrderCard, OrderSheet, prettyDay } from "@/components/OrderCalendar";
import type { Order } from "@/app/dashboard/order-actions";

/** Orders tab: grouped by the day they're due. */
export function OrdersList({ orders, currency, icon, bizName, today }: { orders: Order[]; currency: string; icon: string; bizName: string; today: string }) {
  const si = useLang() === "si";
  const router = useRouter();
  const [open, setOpen] = useState<Order | null>(null);
  const ctx = { currency, icon, bizName, si };
  const groups = new Map<string, Order[]>();
  for (const o of orders) { if (!groups.has(o.due_date)) groups.set(o.due_date, []); groups.get(o.due_date)!.push(o); }
  if (!orders.length) return <div className="card p-10 text-center text-muted mt-4">{si ? "Orders නෑ" : "No orders here"}</div>;
  return (
    <div className="space-y-6 mt-5">
      {[...groups].map(([d, list]) => (
        <section key={d}>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <h2 className="font-display font-bold">{d === today ? (si ? "අද" : "Today") : prettyDay(d)} <span className="text-muted text-sm font-semibold">{d === today ? prettyDay(d) : ""}</span></h2>
            <span className="text-xs font-semibold text-muted border border-line rounded-full px-2 py-0.5">{list.length} {list.length === 1 ? "order" : "orders"}</span>
          </div>
          <div className="space-y-2">{list.map((o) => <OrderCard key={o.id} o={o} ctx={ctx} onOpen={setOpen} />)}</div>
        </section>
      ))}
      {open && <OrderSheet o={open} ctx={ctx} onClose={() => setOpen(null)} onChanged={(x) => { setOpen(x); router.refresh(); }} />}
    </div>
  );
}
