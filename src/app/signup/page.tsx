import { Suspense } from "react";
import { Header } from "@/components/Header";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "signup" };

export default function Page() {
  return (
    <>
      <Header />
      <main className="flex justify-center px-4 py-16">
        <Suspense><AuthForm mode="signup" /></Suspense>
      </main>
    </>
  );
}
