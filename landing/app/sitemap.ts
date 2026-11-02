import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

// Rendered once at build time for the static export.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: "monthly", priority: 1 }];
}
