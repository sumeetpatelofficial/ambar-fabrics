import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/seo/metadata"
import { publicEnv } from "@/lib/env/public"

/**
 * Search engines are welcome only on the real, public site. A preview deployment, a local run or the test
 * server (anything on localhost, or not in production mode) asks to be left out, so unfinished pages never
 * get indexed. Private areas are always off limits.
 */
export default function robots(): MetadataRoute.Robots {
  const host = new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname
  const isPublic =
    process.env.NODE_ENV === "production" && host !== "localhost" && host !== "127.0.0.1"
  if (!isPublic) return { rules: { userAgent: "*", disallow: "/" } }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/checkout",
        "/cart",
        "/api/",
        "/login",
        "/register",
        "/track-order",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  }
}
