import Link from "next/link";
import { requireBusiness } from "@/lib/business";
import { getLang } from "@/lib/lang";
import { effectivePlan } from "@/lib/plan";
import { markDone, replyChat } from "../ai-actions";

export const metadata = { title: "Chats" };

type Chat = { id: string; customer_name: string | null; customer_phone: string | null; status: string; needs_owner: boolean; last_message: string | null; message_count: number; updated_at: string };
type Msg = { role: string; content: string; meta: { booking?: { token: string; summary: string }; order?: { token: string; summary: string } } | null; created_at: string };

const TAG: Record<string, [string, string]> = {
  needs_owner: ["🙋 Needs you", "bg-amber-500/15 text-amber-600 dark:text-amber-400"],
  booked: ["Booked ✓", "bg-green-500/15 text-green-600 dark:text-green-400"],
  answered: ["Answered", "bg-black/5 dark:bg-white/10 text-muted"],
  changed: ["Changed", "bg-sky-500/15 text-sky-600 dark:text-sky-400"],
  open: ["Chatting", "bg-black/5 dark:bg-white/10 text-muted"],
};
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };

export default async function Chats({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { supabase, business } = await requireBusiness();
  const si = (await getLang()) === "si";
  if (effectivePlan(business) !== "ai") {
    return (
      <div className="max-w-xl card p-8 text-center">
        <div className="text-4xl">💬</div>
        <h1 className="font-display font-bold text-2xl mt-2">AI assistant</h1>
        <p className="text-muted mt-2">{si ? "Customers ලට chat කරලාම book කරන්න පුළුවන් AI receptionist කෙනෙක් — AI plan එකෙන්." : "An AI receptionist that answers customers and books for you — on the AI plan."}</p>
        <Link href="/dashboard/settings?tab=plan" className="btn mt-5">⭐ {si ? "AI plan එක ගන්න" : "Get the AI plan"}</Link>
      </div>
    );
  }
  const { c } = await searchParams;
  const { data, error } = await supabase.from("ai_chats").select("id, customer_name, customer_phone, status, needs_owner, last_message, message_count, updated_at")
    .eq("business_id", business.id).gt("message_count", 0).order("needs_owner", { ascending: false }).order("updated_at", { ascending: false }).limit(100);
  if (error) return <div className="card p-6 max-w-xl text-sm">⚠️ {si ? "Supabase එකේ 009_ai_assistant.sql එක run කරන්න." : "Run 009_ai_assistant.sql in Supabase first."}</div>;
  const chats = (data ?? []) as Chat[];
  const open = c ? chats.find((x) => x.id === c) : null;
  let msgs: Msg[] = [];
  if (open) {
    const r = await supabase.from("ai_messages").select("role, content, meta, created_at").eq("chat_id", open.id).order("created_at").limit(200);
    msgs = (r.data ?? []) as Msg[];
  }
  const lastQuestion = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const label = (x: Chat) => x.customer_name || (si ? "නම නෑ" : "Visitor");

  return (
    <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-4 pb-16">
      <div className={`space-y-2 ${open ? "hidden lg:block" : ""}`}>
        <div className="flex items-center justify-between px-1">
          <h1 className="font-display font-bold text-xl">💬 {si ? "Chats" : "Chats"}</h1>
          <Link href="/dashboard/settings?tab=ai" className="text-sm font-semibold text-brand">{si ? "AI settings →" : "AI settings →"}</Link>
        </div>
        {chats.length === 0 && <div className="card p-6 text-sm text-muted">{si ? "තාම chats නෑ. Booking page එකේ “Ask & book” button එකෙන් test කරලා බලන්න." : "No chats yet. Try the “Ask & book” button on your booking page."}</div>}
        {chats.map((x) => {
          const [t, cls] = TAG[x.needs_owner ? "needs_owner" : x.status] ?? TAG.open;
          return (
            <Link key={x.id} href={`?c=${x.id}`} className={`card p-3 flex items-center gap-3 hover:border-brand/50 transition ${x.id === open?.id ? "border-brand bg-soft" : ""} ${x.needs_owner ? "border-amber-500/60" : ""}`}>
              <span className="size-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center font-bold text-sm shrink-0">{label(x).slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2"><b className="text-sm truncate">{label(x)}</b><span className="text-[11px] text-muted shrink-0">{ago(x.updated_at)}</span></span>
                <span className="block text-xs text-muted truncate">{x.last_message}</span>
              </span>
              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>{t}</span>
            </Link>
          );
        })}
      </div>

      {open ? (
        <div className="card p-0 overflow-hidden flex flex-col min-h-[70dvh]">
          <div className="flex items-center gap-3 p-4 border-b border-line">
            <Link href="/dashboard/chats" className="lg:hidden btn-ghost h-9 px-3 text-sm">←</Link>
            <div className="min-w-0 flex-1"><b className="font-display">{label(open)}</b><div className="text-xs text-muted">{open.customer_phone ?? (si ? "Phone එක තාම නෑ" : "No phone yet")}</div></div>
            {open.customer_phone && <a href={`https://wa.me/${open.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9 px-3 text-sm">💬 WhatsApp</a>}
            {open.needs_owner && <form action={markDone.bind(null, open.id)}><button className="btn-ghost h-9 px-3 text-sm">✓ {si ? "ඉවරයි" : "Done"}</button></form>}
          </div>
          <div className="flex-1 p-4 space-y-2 overflow-y-auto">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className="max-w-[80%]">
                  <div className="text-[10px] font-bold text-muted px-1 mb-0.5">{m.role === "user" ? label(open) : m.role === "owner" ? (si ? "ඔයා" : "You") : "AI"}</div>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line ${m.role === "user" ? "bg-black/5 dark:bg-white/10" : m.role === "owner" ? "bg-sky-500/15 border border-sky-500/30" : "bg-soft border border-brand/20"}`}>{m.content.replace(/\*\*/g, "")}</div>
                  {(m.meta?.booking || m.meta?.order) && <div className="mt-1 text-xs rounded-xl bg-green-500/10 border border-green-500/40 px-3 py-2 whitespace-pre-line">✅ {(m.meta.booking ?? m.meta.order)!.summary}</div>}
                </div>
              </div>
            ))}
          </div>
          <form action={replyChat} className="border-t border-line p-3 space-y-2">
            <input type="hidden" name="chat" value={open.id} />
            <input type="hidden" name="question" value={lastQuestion.slice(0, 200)} />
            <textarea name="text" required rows={2} maxLength={1000} className="input h-auto py-3" placeholder={si ? "Customer ට reply එකක් ලියන්න…" : "Write a reply to the customer…"} />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="teach" defaultChecked={open.needs_owner} className="size-4 accent-[#F0521F]" />{si ? "＋ AI ට උගන්වන්න (ඊළඟ පාර AI ම කියයි)" : "＋ Teach AI (it'll know next time)"}</label>
              <button className="btn h-10">{si ? "Send" : "Send"}</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="hidden lg:flex card items-center justify-center text-muted text-sm min-h-[50dvh]">{si ? "වම් පැත්තෙන් chat එකක් තෝරන්න" : "Pick a chat on the left"}</div>
      )}
    </div>
  );
}
