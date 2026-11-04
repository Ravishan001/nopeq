import { DashNav } from "@/components/DashNav";
import { Header } from "@/components/Header";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";
import { signOut } from "./actions";
import { InstallButton } from "@/components/InstallButton";

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
        <DashNav labels={{ dashboard: t("dashboard"), bookings: business.mode === "orders" ? "Orders" : t("bookings"), settings: t("settings") }} slug={business.slug} viewLabel={t("view_page")} />
        <div className="sm:hidden mb-4"><InstallButton className="w-full" /></div>
        <main className="pb-16">{children}</main>
      </div>
    </>
  );
}
