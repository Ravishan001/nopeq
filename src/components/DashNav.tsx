"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

const I = {
  home: <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>,
  cal: <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>,
  gear: <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  chat: <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></svg>,
  ext: <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>,
};

export function DashNav({ labels, slug, viewLabel, chats }: { labels: { dashboard: string; bookings: string; settings: string }; slug: string; viewLabel: string; chats?: number | null }) {
  const path = usePathname();
  const items: (Item & { badge?: number })[] = [
    { href: "/dashboard", label: labels.dashboard, icon: I.home },
    { href: "/dashboard/bookings", label: labels.bookings, icon: I.cal },
    ...(chats !== null && chats !== undefined ? [{ href: "/dashboard/chats", label: "Chats", icon: I.chat, badge: chats }] : []),
    { href: "/dashboard/settings", label: labels.settings, icon: I.gear },
  ];
  const active = (h: string) => (h === "/dashboard" ? path === h : path.startsWith(h));
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 sm:py-5">
      <nav className="flex p-1 rounded-2xl bg-card border border-line w-full sm:w-auto" aria-label="Dashboard">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active(it.href) ? "page" : undefined}
            className={`flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 h-14 sm:h-11 px-2 sm:px-5 rounded-xl text-xs sm:text-sm font-semibold text-center transition-all ${
              active(it.href) ? "bg-brand text-white shadow-md shadow-brand/30" : "text-muted hover:text-fg hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <span className="relative">{it.icon}{!!it.badge && <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{it.badge}</span>}</span>
            <span>{it.label}</span>
          </Link>
        ))}
      </nav>
      <a
        href={`/${slug}`}
        target="_blank"
        className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl border-2 border-brand/40 text-brand font-semibold text-sm hover:bg-brand hover:text-white hover:border-brand transition-all"
      >
        {viewLabel} {I.ext}
      </a>
    </div>
  );
}
