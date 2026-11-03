import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "NopeQ",
    scope: "/",
    short_name: "NopeQ",
    description: "Nope to queues. Book your time.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0B0F1C",
    theme_color: "#F0521F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
