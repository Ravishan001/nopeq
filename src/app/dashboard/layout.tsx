import { DashNav } from "@/components/DashNav";
import { Header } from "@/components/Header";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";
import { signOut } from "./actions";
import { InstallButton } from "@/components/InstallButton";

import type { Metadata } from "next";
import { effectivePlan, isPro } from "@/lib/plan";

/** Pro: the installed dashboard app uses the business name + logo icon. */
export async function generateMetadata(): Promise<Metadata> {
  const { business } = await requireBusiness();
  if (!isPro(business)) return {};
  return {
    manifest: `/api/manifest/${business.slug}?for=dash`,
    icons: { icon: "/icons/favicon.svg", apple: `/api/icon/${business.slug}?s=180` },
    appleWebApp: { capable: true, title: business.name, statusBarStyle: "default" },
  };
}

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const { business, supabase } = await requireBusiness();
  const { t } = await getT();
  // AI plan: a Chats tab with the number of chats waiting for the owner
  let chats: number | null = null;
  if (effectivePlan(business) === "ai") {
    const { count } = await supabase.from("ai_chats").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("needs_owner", true);
    chats = count ?? 0;
  }
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
        <DashNav labels={{ dashboard: t("dashboard"), bookings: business.mode === "orders" ? "Orders" : t("bookings"), settings: t("settings") }} slug={business.slug} viewLabel={t("view_page")} chats={chats} />
        <div className="sm:hidden mb-4"><InstallButton className="w-full" /></div>
        <main className="pb-16">{children}</main>
      </div>
    </>
  );
}
