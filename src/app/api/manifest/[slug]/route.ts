import { loadBrand } from "@/lib/brand";

/**
 * Web app manifest per business.
 *  ?for=dash → the owner's dashboard app (Pro: business name + logo icon)
 *  ?for=book → customers adding the booking page to their home screen
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const url = new URL(req.url);
  const slug = (await params).slug;
  const b = await loadBrand(slug);
  if (!b) return new Response("Not found", { status: 404 });
  const dash = url.searchParams.get("for") === "dash";
  const icon = (s: number, m = false) => (b.pro ? `/api/icon/${slug}?s=${s}${m ? "&m=1" : ""}` : m ? "/icons/maskable-512.png" : `/icons/icon-${s}.png`);
  const name = dash ? (b.pro ? b.name : "NopeQ") : b.name;
  const manifest = {
    id: dash ? (b.pro ? `/dashboard?app=${slug}` : "/dashboard") : `/${slug}`,
    name,
    short_name: name.length > 14 ? name.split(" ").slice(0, 2).join(" ").slice(0, 14) : name,
    description: dash ? `${b.name} · bookings dashboard` : `Book ${b.name} online`,
    start_url: dash ? "/dashboard" : `/${slug}`,
    scope: dash ? "/" : `/${slug}`,
    display: "standalone",
    background_color: "#0B0F1C",
    theme_color: b.pro ? b.color : "#F0521F",
    icons: [
      { src: icon(192), sizes: "192x192", type: "image/png" },
      { src: icon(512), sizes: "512x512", type: "image/png" },
      { src: icon(512, true), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
