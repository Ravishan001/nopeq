import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/sora/700.css";
import "@fontsource/noto-sans-sinhala/400.css";
import "@fontsource/noto-sans-sinhala/600.css";
import "@fontsource/noto-sans-sinhala/700.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { getLang } from "@/lib/lang";

export const metadata: Metadata = {
  title: { default: "NopeQ — Nope to queues", template: "%s · NopeQ" },
  description: "Online booking for salons in Sri Lanka. Powered by Ravion Studio.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/favicon.svg", apple: "/icons/apple-touch-icon-180.png" },
  appleWebApp: { capable: true, title: "NopeQ", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F1C" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
