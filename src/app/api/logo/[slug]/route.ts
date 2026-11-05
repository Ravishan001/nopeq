import sharp from "sharp";
import { loadBrand } from "@/lib/brand";

export const runtime = "nodejs";

/** The business logo as a same-origin PNG (white rounded tile) — for the QR centre and posters. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = await loadBrand((await params).slug);
  if (!b?.logo || !b.logo.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "-")) return new Response("No logo", { status: 404 });
  try {
    const res = await fetch(b.logo, { cache: "force-cache" });
    if (!res.ok) return new Response("No logo", { status: 404 });
    const S = 320, R = 64;
    const logo = await sharp(Buffer.from(await res.arrayBuffer())).resize(S, S, { fit: "cover" }).png().toBuffer();
    const mask = Buffer.from(`<svg width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${R}" ry="${R}" fill="#fff"/></svg>`);
    const png = await sharp(logo).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("No logo", { status: 404 });
  }
}
