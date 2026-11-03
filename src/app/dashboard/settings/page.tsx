import Link from "next/link";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";
import { WEEKDAYS, type TKey } from "@/lib/i18n";
import { addBranch, addStaff, deleteService, removeBranch, removeStaff, saveHours, upsertService } from "../actions";
import { MediaUpload } from "./MediaUpload";
import { currencySymbol } from "@/lib/countries";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "Settings" };
const TABS = ["profile", "services", "staff", "hours", "branches", "account"] as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, business, user } = await requireBusiness();
  const { t, lang } = await getT();
  const tab = (TABS as readonly string[]).includes((await searchParams).tab ?? "") ? (await searchParams).tab! : "profile";

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((x) => (
          <Link key={x} href={`?tab=${x}`} className={`chip whitespace-nowrap ${tab === x ? "chip-on" : ""}`}>{t(`tab_${x}` as TKey)}</Link>
        ))}
      </div>

      {tab === "profile" && (
        <div className="card p-6 space-y-8 max-w-2xl">
          <div className="grid sm:grid-cols-2 gap-6" id="media">
            <MediaUpload field="logo_url" label={t("logo")} url={business.logo_url} userId={user.id} round />
            <MediaUpload field="cover_url" label={t("cover")} url={business.cover_url} userId={user.id} />
          </div>
          <ProfileForm b={business} />
        </div>
      )}

      {tab === "services" && <Services />}
      {tab === "staff" && <Staff />}
      {tab === "hours" && <Hours />}
      {tab === "branches" && <Branches />}
      {tab === "account" && <PasswordForm email={user.email} />}
    </div>
  );

  async function Services() {
    const { data } = await supabase.from("services").select("*").eq("business_id", business.id).eq("active", true).order("section").order("sort");
    const row = (s?: { id: string; name: string; section: string | null; price: number; duration_min: number }) => (
      <form key={s?.id ?? "new"} action={upsertService} className="card p-3 grid grid-cols-2 sm:grid-cols-[1fr_120px_110px_100px_auto_auto] gap-2 items-end">
        {s && <input type="hidden" name="id" value={s.id} />}
        <div className="col-span-2 sm:col-span-1"><label className="label">{t("name")}</label><input name="name" required className="input h-10" defaultValue={s?.name} /></div>
        <div><label className="label">{t("section")}</label>
          <select name="section" className="input h-10" defaultValue={s?.section ?? business.sections[0] ?? ""}>
            {business.sections.map((x) => <option key={x}>{x}</option>)}
          </select></div>
        <div><label className="label">{t("price")} ({currencySymbol(business.currency)})</label><input name="price" type="number" min={0} step="any" className="input h-10" defaultValue={s?.price ?? 0} /></div>
        <div><label className="label">{t("duration")}</label><input name="duration_min" type="number" min={5} step={5} className="input h-10" defaultValue={s?.duration_min ?? 30} /></div>
        <button className="btn h-10">{s ? t("save") : `+ ${t("add")}`}</button>
        {s && <button formAction={deleteService} className="btn-ghost h-10 text-red-500">{t("delete")}</button>}
      </form>
    );
    return <div className="space-y-2 max-w-4xl">{(data ?? []).map((s) => row(s))}<div className="pt-4">{row()}</div></div>;
  }

  async function Staff() {
    const { data } = await supabase.from("staff").select("id, name").eq("business_id", business.id).eq("active", true).order("created_at");
    return (
      <div className="card p-6 max-w-xl space-y-3">
        {(data ?? []).map((s) => (
          <form key={s.id} action={removeStaff} className="flex items-center justify-between border-b border-line pb-3">
            <input type="hidden" name="id" value={s.id} />
            <span className="font-semibold">{s.name}</span>
            <button className="btn-ghost h-9 text-sm text-red-500">{t("delete")}</button>
          </form>
        ))}
        <form action={addStaff} className="flex gap-2 pt-2">
          <input name="name" required className="input" placeholder={t("add_staff")} />
          <button className="btn">+ {t("add")}</button>
        </form>
      </div>
    );
  }

  async function Hours() {
    const { data } = await supabase.from("business_hours").select("*").eq("business_id", business.id);
    const by = new Map((data ?? []).map((h) => [h.weekday, h]));
    return (
      <form action={saveHours} className="card p-6 max-w-xl space-y-3">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => {
          const h = by.get(w);
          return (
            <div key={w} className="grid grid-cols-[70px_auto_1fr_1fr] gap-3 items-center">
              <span className="font-bold">{WEEKDAYS[lang][w]}</span>
              <input type="checkbox" name={`open_${w}`} defaultChecked={h?.is_open ?? false} className="size-5 accent-[#F0521F]" />
              <input type="time" name={`from_${w}`} className="input h-10" defaultValue={(h?.open_time ?? "09:00").slice(0, 5)} />
              <input type="time" name={`to_${w}`} className="input h-10" defaultValue={(h?.close_time ?? "20:00").slice(0, 5)} />
            </div>
          );
        })}
        <button className="btn mt-2">{t("save")}</button>
      </form>
    );
  }

  async function Branches() {
    const { data } = await supabase.from("branches").select("id, name").eq("business_id", business.id).order("created_at");
    return (
      <div className="card p-6 max-w-xl space-y-3">
        {(data ?? []).map((s) => (
          <form key={s.id} action={removeBranch} className="flex items-center justify-between border-b border-line pb-3">
            <input type="hidden" name="id" value={s.id} />
            <span className="font-semibold">📍 {s.name}</span>
            <button className="btn-ghost h-9 text-sm text-red-500">{t("delete")}</button>
          </form>
        ))}
        <form action={addBranch} className="flex gap-2 pt-2">
          <input name="name" required className="input" placeholder={t("add_branch")} />
          <button className="btn">+ {t("add")}</button>
        </form>
      </div>
    );
  }
}
