import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "./supabase/server";
import { getUserFast } from "./business";
import { adminClient } from "./supabase/admin";

/** Ravion Studio accounts that may open /admin (comma list in ADMIN_EMAILS). */
const admins = () => (process.env.ADMIN_EMAILS || "ravishantennakoon111@gmail.com").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Anyone else gets a plain 404 — the page doesn't reveal that it exists. */
export async function requireAdmin() {
  const user = await getUserFast(await createClient());
  if (!user?.email || !admins().includes(user.email.toLowerCase())) notFound();
  const db = adminClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return { db, user };
}
