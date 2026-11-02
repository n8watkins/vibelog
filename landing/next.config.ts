import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static: `next build` writes plain HTML, CSS, JS and images to out/,
  // which Cloudflare Workers static assets serves (see wrangler.jsonc and DEPLOY.md).
  // There is no image optimizer at runtime, so screenshots ship as pre-compressed WebP.
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
  // landing/ is a standalone app inside the agent repo; pin the root so
  // Turbopack does not pick the agent's pnpm-lock.yaml one level up.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
