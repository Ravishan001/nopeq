"use client";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "./I18nProvider";
import type { Lang } from "@/lib/i18n";

export function Providers({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider lang={lang}>{children}</I18nProvider>
    </ThemeProvider>
  );
}
