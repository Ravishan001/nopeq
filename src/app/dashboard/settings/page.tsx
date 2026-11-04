import Link from "next/link";
import { requireBusiness } from "@/lib/business";
import { getT } from "@/lib/lang";
import { WEEKDAYS, type TKey } from "@/lib/i18n";
import { addBranch, addStaff, deleteService, removeBranch, removeStaff, saveHours, saveRules, saveStaffInfo, setServiceImages, setStaffPortfolio, upsertService } from "../actions";
import { OwnerPhotos } from "./OwnerPhotos";
import { KINDS, getKind, readOptions } from "@/lib/templates";
import { MediaUpload } from "./MediaUpload";
import { currencySymbol } from "@/lib/countries";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";
import { setNotifyPrefs } from "../notify-actions";

export const metadata = { title: "Settings" };
const ALL_TABS = ["profile", "services", "staff", "hours", "rules", "branches", "account"] as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, business, user } = await requireBusiness();
  const { t, lang } = await getT();
  const orders = business.mode === "orders";
  const kind = getKind(business.type);
  const TABS = ALL_TABS.filter((x) => !(orders && x === "staff"));
  const tab = (TABS as readonly string[]).includes((await searchParams).tab ?? "") ? (await searchParams).tab! : "profile";
  const si = lang === "si";

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((x) => (
          <Link key={x} href={`?tab=${x}`} className={`chip whitespace-nowrap ${tab === x ? "chip-on" : ""}`}>{x === "services" && orders ? "Products" : x === "rules" ? (orders ? (si ? "Order rules" : "Order rules") : (si ? "Booking rules" : "Booking rules")) : x === "staff" && kind.staffWord ? `${kind.staffWord[lang]}s` : t(`tab_${x}` as TKey)}</Link>
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
      {tab === "rules" && <Rules />}
      {tab === "branches" && <Branches />}
      {tab === "account" && (
        <div className="space-y-6">
          <PasswordForm email={user.email} />
          <form action={setNotifyPrefs} className="card p-6 max-w-md space-y-3">
            <h2 className="font-display font-bold text-lg">🔔 {t("notif_title")}</h2>
            <label className="flex items-center gap-3"><input type="checkbox" name="notify_push" defaultChecked={business.notify_push} className="size-5 accent-[#F0521F]" />{t("notif_push")}</label>
            <label className="flex items-center gap-3"><input type="checkbox" name="notify_email" defaultChecked={business.notify_email} className="size-5 accent-[#F0521F]" />{t("notif_email")}</label>
            <button className="btn h-10">{t("save")}</button>
          </form>
        </div>
      )}
    </div>
  );

  async function Services() {
    const { data } = await supabase.from("services").select("*").eq("business_id", business.id).eq("active", true).order("section").order("sort");
    type Svc = { id: string; name: string; section: string | null; price: number; duration_min: number; description?: string | null; image_url?: string | null; options?: unknown };
    const sym = currencySymbol(business.currency);
    const row = (s?: Svc) => {
      const o = readOptions(s?.options);
      return (
        <div key={s?.id ?? "new"} className="card p-3 space-y-2">
          <form action={upsertService} className={`grid grid-cols-2 gap-2 items-end ${orders ? "sm:grid-cols-[1fr_120px_110px_auto_auto]" : "sm:grid-cols-[1fr_120px_110px_100px_auto_auto]"}`}>
            {s && <input type="hidden" name="id" value={s.id} />}
            <div className="col-span-2 sm:col-span-1"><label className="label">{t("name")}</label><input name="name" required className="input h-10" defaultValue={s?.name} /></div>
            <div><label className="label">{t("section")}</label>
              <select name="section" className="input h-10" defaultValue={s?.section ?? business.sections[0] ?? ""}>
                {business.sections.map((x) => <option key={x}>{x}</option>)}
              </select></div>
            <div><label className="label">{t("price")} ({sym})</label><input name="price" type="number" min={0} step="any" className="input h-10" defaultValue={s?.price ?? 0} /></div>
            {!orders && <div><label className="label">{t("duration")}</label><input name="duration_min" type="number" min={5} step={5} className="input h-10" defaultValue={s?.duration_min ?? 30} /></div>}
            <button className="btn h-10">{s ? t("save") : `+ ${t("add")}`}</button>
            {s && <button formAction={deleteService} className="btn-ghost h-10 text-red-500">{t("delete")}</button>}
            <div className="col-span-2 sm:col-span-full"><label className="label">{si ? "විස්තරය (optional)" : "Short description (optional)"}</label>
              <input name="description" maxLength={120} className="input h-10" defaultValue={s?.description ?? ""} placeholder={orders ? "e.g. Fresh cream, serves 8" : "e.g. Palm size · ~3 hours"} /></div>
            {orders && (
              <>
                <div className="col-span-2 sm:col-span-full sm:grid sm:grid-cols-2 sm:gap-2 space-y-2 sm:space-y-0">
                  <div><label className="label">{si ? "Sizes · පේළියකට එකක් (size = ගාණ)" : "Sizes · one per line (size = price)"}</label>
                    <textarea name="sizes" rows={3} className="input h-auto py-2 text-sm" defaultValue={o.sizes.map((z) => `${z.label} = ${z.price}`).join("\n")} placeholder={"1 kg = 3500\n2 kg = 6500"} /></div>
                  <div><label className="label">{si ? "Flavours / types · comma වලින් වෙන් කරන්න" : "Flavours / types · comma separated"}</label>
                    <textarea name="flavours" rows={3} className="input h-auto py-2 text-sm" defaultValue={o.flavours.join(", ")} placeholder="Chocolate, Vanilla, Red velvet" /></div>
                </div>
                <p className="col-span-2 sm:col-span-full text-xs text-muted">{si ? "Sizes දැම්මොත් customer ට size එක තෝරන්න වෙනවා, price එක size එකෙන් එනවා." : "With sizes, customers must pick one and the price comes from the size."}</p>
              </>
            )}
          </form>
          {s && orders && (
            <OwnerPhotos userId={user.id} prefix="product" urls={s.image_url ? [s.image_url] : []} max={1} small label={si ? "Product photo" : "Product photo"} save={setServiceImages.bind(null, s.id)} />
          )}
        </div>
      );
    };
    return <div className="space-y-2 max-w-4xl">{((data ?? []) as Svc[]).map((s) => row(s))}<div className="pt-4">{row()}</div></div>;
  }

  async function Staff() {
    const { data } = await supabase.from("staff").select("*").eq("business_id", business.id).eq("active", true).order("created_at");
    type St = { id: string; name: string; specialty?: string | null; portfolio?: string[] | null };
    return (
      <div className="max-w-2xl space-y-3">
        {((data ?? []) as St[]).map((s) => (
          <div key={s.id} className="card p-4 space-y-3">
            <form action={saveStaffInfo} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
              <input type="hidden" name="id" value={s.id} />
              <div><label className="label">{t("name")}</label><input name="name" required maxLength={60} className="input h-10" defaultValue={s.name} /></div>
              <div><label className="label">{si ? "Specialty (optional)" : "Specialty (optional)"}</label><input name="specialty" maxLength={60} className="input h-10" defaultValue={s.specialty ?? ""} placeholder={kind.id === "tattoo" ? "Fine line · Blackwork" : ""} /></div>
              <button className="btn h-10">{t("save")}</button>
              <button formAction={removeStaff} className="btn-ghost h-10 text-red-500">{t("delete")}</button>
            </form>
            <OwnerPhotos userId={user.id} prefix="portfolio" urls={s.portfolio ?? []} max={12} small
              label={si ? "Portfolio photos · customer ට පේනවා (optional)" : "Portfolio photos · shown to customers (optional)"} save={setStaffPortfolio.bind(null, s.id)} />
          </div>
        ))}
        <form action={addStaff} className="card p-4 flex gap-2">
          <input name="name" required className="input" placeholder={t("add_staff")} />
          <button className="btn">+ {t("add")}</button>
        </form>
      </div>
    );
  }

  async function Rules() {
    const money = currencySymbol(business.currency);
    return (
      <form action={saveRules} className="card p-6 max-w-xl space-y-5">
        <div>
          <label className="label" htmlFor="rtype">{si ? "Business type එක" : "Business type"}</label>
          <select id="rtype" name="type" className="input" defaultValue={kind.id}>
            <optgroup label={si ? "⏰ Appointments · වෙලාවට" : "⏰ Appointments · time slots"}>
              {KINDS.filter((k) => k.mode === "slots").map((k) => <option key={k.id} value={k.id}>{k.icon} {k[lang]}</option>)}
            </optgroup>
            <optgroup label={si ? "📅 Orders · දවසට" : "📅 Orders · pick a day"}>
              {KINDS.filter((k) => k.mode === "orders").map((k) => <option key={k.id} value={k.id}>{k.icon} {k[lang]}</option>)}
            </optgroup>
          </select>
          <p className="text-xs text-muted mt-1">{si ? "Appointments ↔ Orders මාරු කළොත් booking page එකයි dashboard එකයි මාරු වෙනවා. දැනට තියෙන bookings / orders මැකෙන්නේ නෑ." : "Switching between appointments and orders changes your booking page and dashboard. Existing bookings / orders stay."}</p>
        </div>
        {orders ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="dl">{si ? "දවසකට max orders" : "Max orders a day"}</label><input id="dl" name="daily_limit" type="number" min={1} max={500} className="input" defaultValue={business.daily_limit ?? 6} /></div>
              <div><label className="label" htmlFor="ld">{si ? "කලින් order කරන්න ඕන දවස්" : "Days' notice needed"}</label><input id="ld" name="lead_days" type="number" min={0} max={60} className="input" defaultValue={business.lead_days ?? 1} /></div>
            </div>
            <div className="rounded-2xl border border-line p-4 space-y-3">
              <label className="flex items-center gap-3 font-semibold"><input type="checkbox" name="delivery" defaultChecked={business.delivery_fee != null} className="size-5 accent-[#F0521F]" />🛵 {si ? "Delivery කරනවා" : "We deliver"}</label>
              <div><label className="label" htmlFor="df">{si ? "Delivery ගාස්තුව" : "Delivery fee"} ({money})</label><input id="df" name="delivery_fee" type="number" min={0} step="any" className="input" defaultValue={business.delivery_fee ?? 0} /></div>
            </div>
            <div><label className="label" htmlFor="ap">{si ? "Confirm කරන්න advance එක (%)" : "Advance to confirm (%)"}</label><input id="ap" name="advance_pct" type="number" min={0} max={100} className="input" defaultValue={business.advance_pct ?? 0} />
              <p className="text-xs text-muted mt-1">{si ? "0 = advance නෑ. Online payments පස්සේ එනවා; දැනට customer ට ගාණ පෙන්නනවා විතරයි." : "0 = no advance. Online payment comes later; for now customers just see the amount."}</p></div>
          </>
        ) : (
          <>
            <div><label className="label" htmlFor="dep">{si ? "Deposit එක" : "Deposit to confirm"} ({money})</label><input id="dep" name="deposit_amount" type="number" min={0} step="any" className="input" defaultValue={business.deposit_amount ?? 0} />
              <p className="text-xs text-muted mt-1">{si ? "0 = deposit නෑ. Booking කරනකොට customer ට පෙන්නනවා." : "0 = no deposit. Shown to customers when they book."}</p></div>
            <div><label className="label" htmlFor="pn">{si ? "එන්න කලින් note එක (optional)" : "Before-you-come note (optional)"}</label>
              <textarea id="pn" name="prep_note" rows={3} maxLength={300} className="input h-auto py-3" defaultValue={business.prep_note ?? ""}
                placeholder={kind.id === "tattoo" ? "Eat well, no alcohol 24 h before, wear clothes that show the area." : ""} /></div>
          </>
        )}
        <button className="btn">{t("save")}</button>
      </form>
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
