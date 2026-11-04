import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // customer photo uploads are shrunk in the browser first; this leaves room for them
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
