import { cookies } from "next/headers";
import { translate, type Lang, type TKey } from "./i18n";

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("lang")?.value;
  return c === "en" ? "en" : "si";
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: (k: TKey, v?: Record<string, string | number>) => translate(lang, k, v) };
}
