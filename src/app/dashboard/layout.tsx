import Link from "next/link";
import { Header } from "@/components/Header";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";
import { signOut } from "./actions";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const { business } = await requireBusiness();
  const { t } = await getT();
  return (
    <>
      <Header
        right={
          <form action={signOut}>
            <button className="btn-ghost h-9 text-sm">{t("logout")}</button>
          </form>
        }
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav className="flex gap-1 py-4 overflow-x-auto text-sm font-semibold">
          {[
            ["/dashboard", t("dashboard")],
            ["/dashboard/bookings", t("bookings")],
            ["/dashboard/settings", t("settings")],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="px-4 py-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">{label}</Link>
          ))}
          <Link href={`/${business.slug}`} target="_blank" className="ml-auto px-4 py-2 rounded-full text-brand whitespace-nowrap">{t("view_page")} ↗</Link>
        </nav>
        <main className="pb-16">{children}</main>
      </div>
    </>
  );
}
