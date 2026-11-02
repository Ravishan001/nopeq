import { headers } from "next/headers";
import { getCountry } from "./countries";

/** Visitor's country + time zone from Vercel's edge headers (falls back to US). */
export async function detectGeo() {
  const h = await headers();
  const code = h.get("x-vercel-ip-country");
  const country = getCountry(code);
  const tz = h.get("x-vercel-ip-timezone");
  return { country, tz: tz && code && code.toUpperCase() === country.code ? tz : country.tz };
}
