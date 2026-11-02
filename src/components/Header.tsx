import Link from "next/link";
import { Wordmark } from "./Logo";
import { Toggles } from "./Toggles";

export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-app/80 border-b border-line">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-3 px-4 h-16">
        <Link href="/" aria-label="NopeQ home"><Wordmark size={26} /></Link>
        <div className="flex items-center gap-2">
          <Toggles />
          {right}
        </div>
      </div>
    </header>
  );
}

export function PoweredBy() {
  return (
    <p className="text-center text-sm text-muted py-8">
      powered by <a href="https://ravionstudio.com" className="font-semibold text-fg hover:text-brand">Ravion Studio</a>
    </p>
  );
}
