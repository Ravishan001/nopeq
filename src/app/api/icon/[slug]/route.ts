import sharp from "sharp";
import { loadBrand } from "@/lib/brand";

export const runtime = "nodejs";
const SIZES = new Set([180, 192, 512]);

/** App icon made from the business logo (Pro). Anyone else gets the NopeQ icon. ?s=192|512|180 &m=1 for maskable */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const url = new URL(req.url);
  const size = SIZES.has(Number(url.searchParams.get("s"))) ? Number(url.searchParams.get("s")) : 512;
  const maskable = url.searchParams.get("m") === "1";
  const fallback = () => Response.redirect(new URL(size === 180 ? "/icons/apple-touch-icon-180.png" : maskable ? "/icons/maskable-512.png" : `/icons/icon-${size === 512 ? 512 : 192}.png`, url), 302);

  const b = await loadBrand((await params).slug);
  if (!b?.pro || !b.logo || !b.logo.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "-")) return fallback();
  try {
    const res = await fetch(b.logo, { cache: "force-cache" });
    if (!res.ok) return fallback();
    const src = Buffer.from(await res.arrayBuffer());
    // maskable icons need a safe zone: logo at 80% on a solid background
    const inner = maskable ? Math.round(size * 0.8) : size;
    const logo = await sharp(src).resize(inner, inner, { fit: "cover" }).png().toBuffer();
    // background = the logo's own corner colour, so the safe-zone padding blends in
    const { data: px } = await sharp(src).resize(8, 8, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const bg = { r: px[0], g: px[1], b: px[2], alpha: 1 };
    const png = await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
      .composite([{ input: logo, gravity: "center" }]).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
  } catch {
    return fallback();
  }
}
