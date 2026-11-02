import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/business";
import { Wizard } from "./Wizard";
import { detectGeo } from "@/lib/geo";

export const metadata = { title: "Setup" };

export default async function Onboarding() {
  const supabase = await createClient();
  const user = await getUserFast(supabase);
  if (!user) redirect("/login");
  const { data } = await supabase.from("businesses").select("id").eq("owner_id", user.id).maybeSingle();
  if (data) redirect("/dashboard");
  const geo = await detectGeo();
  return (
    <>
      <Header />
      <main className="flex justify-center px-4 py-10">
        <Wizard detectedCountry={geo.country.code} detectedTz={geo.tz} />
      </main>
    </>
  );
}
