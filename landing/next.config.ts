import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  // landing/ is a standalone app inside the agent repo; pin the root so
  // Turbopack does not pick the agent's pnpm-lock.yaml one level up.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
