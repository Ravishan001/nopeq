import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { Wizard } from "./Wizard";

export const metadata = { title: "Setup" };

export default async function Onboarding() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("businesses").select("id").eq("owner_id", user.id).maybeSingle();
  if (data) redirect("/dashboard");
  return (
    <>
      <Header />
      <main className="flex justify-center px-4 py-10">
        <Wizard />
      </main>
    </>
  );
}
