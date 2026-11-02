"use client";
import { createContext, useContext } from "react";
import { translate, type Lang, type TKey } from "@/lib/i18n";

const Ctx = createContext<Lang>("si");

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

export function useT() {
  const lang = useContext(Ctx);
  return (k: TKey, v?: Record<string, string | number>) => translate(lang, k, v);
}
