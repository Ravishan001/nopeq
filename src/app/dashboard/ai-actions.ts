"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/business";

export async function saveAi(form: FormData) {
  const { supabase, business } = await requireBusiness();
  const lang = String(form.get("ai_lang") ?? "auto"), tone = String(form.get("ai_tone") ?? "friendly");
  await supabase.from("businesses").update({
    ai_enabled: form.get("ai_enabled") === "on",
    ai_can_book: form.get("ai_can_book") === "on",
    ai_lang: ["auto", "si", "en"].includes(lang) ? lang : "auto",
    ai_tone: ["friendly", "formal", "short"].includes(tone) ? tone : "friendly",
    ai_notes: String(form.get("ai_notes") ?? "").trim().slice(0, 4000) || null,
  }).eq("id", business.id);
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/${business.slug}`);
}

const uuid = z.string().uuid();

/** Owner answers a chat; the customer sees it in the chat window. */
export async function replyChat(form: FormData) {
  const id = String(form.get("chat") ?? ""), text = String(form.get("text") ?? "").trim().slice(0, 1000);
  if (!uuid.safeParse(id).success || !text) return;
  const { supabase, business } = await requireBusiness();
  const { data: chat } = await supabase.from("ai_chats").select("id").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!chat) return;
  await supabase.from("ai_messages").insert({ chat_id: id, role: "owner", content: text });
  await supabase.from("ai_chats").update({ needs_owner: false, status: "answered", updated_at: new Date().toISOString() }).eq("id", id);
  // "Teach AI": keep the answer so the assistant knows it next time
  if (form.get("teach") === "on") {
    const q = String(form.get("question") ?? "").trim().slice(0, 200);
    const line = `• ${q ? `${q} → ` : ""}${text}`.slice(0, 400);
    const notes = `${business.ai_notes ? `${business.ai_notes.trim()}\n` : ""}${line}`.slice(-4000);
    await supabase.from("businesses").update({ ai_notes: notes }).eq("id", business.id);
  }
  revalidatePath("/dashboard/chats");
}

export async function markDone(id: string) {
  if (!uuid.safeParse(id).success) return;
  const { supabase, business } = await requireBusiness();
  await supabase.from("ai_chats").update({ needs_owner: false, status: "answered" }).eq("id", id).eq("business_id", business.id);
  revalidatePath("/dashboard/chats");
}
