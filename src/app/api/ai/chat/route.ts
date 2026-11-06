import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { aiErrorReason, aiOn, respond, type Biz, type Meta } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const slugRe = /^[a-z0-9][a-z0-9-]{2,39}$/;
const tokenRe = /^[a-f0-9]{32}$/;
const MAX_MESSAGES = 60;

async function loadBiz(slug: string) {
  const db = adminClient();
  if (!db || !slugRe.test(slug)) return null;
  const { data } = await db.from("businesses").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  return data ? { db, b: data as Biz } : null;
}
const out = (o: unknown, status = 200) => Response.json(o, { status, headers: { "Cache-Control": "no-store" } });
type Row = { role: string; content: string; meta: Meta | null; created_at: string };

/** History of one chat (also used for polling owner replies). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("slug") ?? "", token = u.searchParams.get("token") ?? "";
  const x = await loadBiz(slug);
  if (!x || !aiOn(x.b)) return out({ on: false });
  if (!tokenRe.test(token)) return out({ on: true, messages: [] });
  const { data: chat } = await x.db.from("ai_chats").select("id").eq("token", token).eq("business_id", x.b.id).maybeSingle();
  if (!chat) return out({ on: true, messages: [] });
  const { data } = await x.db.from("ai_messages").select("role, content, meta, created_at").eq("chat_id", chat.id).order("created_at").limit(200);
  return out({ on: true, messages: (data ?? []) as Row[] });
}

const body = z.object({ slug: z.string(), token: z.string().optional(), message: z.string().trim().min(1).max(600) });

export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return out({ error: "invalid" }, 400);
  const x = await loadBiz(p.data.slug);
  if (!x || !aiOn(x.b)) return out({ error: "off" }, 403);
  const { db, b } = x;

  // find or start the chat (new chats count towards the monthly limit)
  let chat: { id: string; token: string; message_count: number } | null = null;
  if (p.data.token && tokenRe.test(p.data.token)) {
    const { data } = await db.from("ai_chats").select("id, token, message_count").eq("token", p.data.token).eq("business_id", b.id).maybeSingle();
    chat = data;
  }
  if (!chat) {
    const { data: used, error: uErr } = await db.rpc("ai_month_chats", { p_business: b.id });
    if (uErr) { console.error("ai_month_chats", uErr); return out({ error: "server", reason: `db-count-${uErr.code ?? "x"}` }, 500); }
    if (Number(used ?? 0) >= (b.ai_limit ?? 500)) return out({ error: "limit" }, 429);
    const { data, error } = await db.from("ai_chats").insert({ business_id: b.id }).select("id, token, message_count").single();
    if (error || !data) { console.error("ai_chats insert", error); return out({ error: "server", reason: `db-chat-${error?.code ?? "x"}` }, 500); }
    chat = data;
  }
  if (chat.message_count >= MAX_MESSAGES) return out({ error: "long", token: chat.token }, 429);

  const { error: mErr } = await db.from("ai_messages").insert({ chat_id: chat.id, role: "user", content: p.data.message });
  if (mErr) { console.error("ai_messages insert", mErr); return out({ error: "server", reason: `db-msg-${mErr.code ?? "x"}`, token: chat.token }, 500); }
  const { data: hist } = await db.from("ai_messages").select("role, content").eq("chat_id", chat.id).order("created_at", { ascending: false }).limit(24);
  // owner replies are shown to the model as the assistant speaking for the shop
  const history = ((hist ?? []) as { role: string; content: string }[]).reverse()
    .map((m) => ({ role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant", content: m.role === "owner" ? `(The shop owner replied:) ${m.content}` : m.content }))
    .reduce<{ role: "user" | "assistant"; content: string }[]>((acc, m) => {
      // the API wants alternating roles: merge neighbours with the same role
      const last = acc[acc.length - 1];
      if (last && last.role === m.role) last.content += `\n${m.content}`; else acc.push({ ...m });
      return acc;
    }, []);
  while (history.length && history[0].role !== "user") history.shift();

  let reply: Awaited<ReturnType<typeof respond>>;
  try {
    reply = await respond(b, chat.id, history);
  } catch (e) {
    const reason = aiErrorReason(e);
    console.error("ai respond", reason, e);
    return out({ error: "ai", reason, token: chat.token }, 502);
  }
  const meta: Meta = reply.meta;
  await db.from("ai_messages").insert({ chat_id: chat.id, role: "assistant", content: reply.text.slice(0, 4000), meta: Object.keys(meta).length ? meta : null });
  const status = meta.booking || meta.order ? "booked" : meta.handoff ? "needs_owner" : undefined;
  await db.from("ai_chats").update({
    message_count: chat.message_count + 2, last_message: p.data.message.slice(0, 300), updated_at: new Date().toISOString(),
    ...(status ? { status } : {}), ...(reply.customer.name ? { customer_name: reply.customer.name.slice(0, 60) } : {}), ...(reply.customer.phone ? { customer_phone: reply.customer.phone.slice(0, 20) } : {}),
  }).eq("id", chat.id);
  return out({ token: chat.token, message: { role: "assistant", content: reply.text, meta } });
}
