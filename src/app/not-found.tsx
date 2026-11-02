import Link from "next/link";
import { Header } from "@/components/Header";
import { Mark } from "@/components/Logo";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <Mark size={80} />
        <h1 className="font-display font-bold text-3xl mt-6">404</h1>
        <p className="text-muted mt-2">Page එක හොයාගන්න බෑ / Page not found</p>
        <Link href="/" className="btn mt-6">NopeQ →</Link>
      </main>
    </>
  );
}
