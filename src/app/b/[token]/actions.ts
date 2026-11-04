"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { notifyBooking } from "@/lib/notify";
import { zonedToUtc } from "@/lib/time";

const tok = z.string().regex(/^[a-f0-9]{24}$/);

export async function requestChange(token: string, date: string, time: string): Promise<{ ok?: boolean; error?: string }> {
  if (!tok.safeParse(token).success || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d\d:\d\d$/.test(time)) return { error: "generic" };
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_booking", { p_token: token });
  const b = data?.[0];
  if (!b) return { error: "generic" };
  const { error } = await supabase.rpc("request_reschedule", {
    p_token: token, p_starts_at: zonedToUtc(date, time, b.timezone).toISOString(), p_staff_id: b.staff_id,
  });
  if (error) return { error: error.message.includes("slot_taken") ? "slot_taken" : "generic" };
  after(() => notifyBooking(token, "change_request"));
  revalidatePath(`/b/${token}`);
  return { ok: true };
}

export async function withdrawChange(token: string) {
  if (!tok.safeParse(token).success) return;
  const supabase = await createClient();
  await supabase.rpc("withdraw_reschedule", { p_token: token });
  revalidatePath(`/b/${token}`);
}
