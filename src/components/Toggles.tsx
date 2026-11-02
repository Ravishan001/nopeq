"use client";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "./I18nProvider";

const pill = "flex rounded-full bg-black/5 dark:bg-white/10 p-0.5 text-xs font-bold";
const opt = (on: boolean) =>
  `px-2.5 py-1 rounded-full transition ${on ? "bg-brand text-white" : "text-muted"}`;

export function LangToggle() {
  const lang = useLang();
  const router = useRouter();
  const set = (l: string) => {
    document.cookie = `lang=${l};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  return (
    <div className={pill} role="group" aria-label="Language">
      <button className={opt(lang === "si")} onClick={() => set("si")}>සිං</button>
      <button className={opt(lang === "en")} onClick={() => set("en")}>EN</button>
    </div>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const dark = ready && resolvedTheme === "dark";
  return (
    <div className={pill} role="group" aria-label="Theme">
      <button className={opt(ready && !dark)} onClick={() => setTheme("light")} aria-label="Light">☀</button>
      <button className={opt(dark)} onClick={() => setTheme("dark")} aria-label="Dark">☾</button>
    </div>
  );
}

export function Toggles() {
  return (
    <div className="flex gap-1.5">
      <LangToggle />
      <ThemeToggle />
    </div>
  );
}
