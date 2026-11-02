import { cookies, headers } from "next/headers";
import { translate, type Lang, type TKey } from "./i18n";

/** Saved choice first; otherwise සිංහල for visitors in Sri Lanka (or Sinhala browsers), English for everyone else. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("lang")?.value;
  if (c === "en" || c === "si") return c;
  const h = await headers();
  if (h.get("x-vercel-ip-country") === "LK" || /(^|,)\s*si\b/i.test(h.get("accept-language") ?? "")) return "si";
  return "en";
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: (k: TKey, v?: Record<string, string | number>) => translate(lang, k, v) };
}
