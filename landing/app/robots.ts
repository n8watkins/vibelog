import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

// Rendered once at build time for the static export.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }], sitemap: `${SITE_URL}/sitemap.xml` };
}
