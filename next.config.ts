import type { NextConfig } from "next"

const isProd = process.env.NODE_ENV === "production"

// Static security headers. A nonce-based Content-Security-Policy is added in Phase 13 (report-only first).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
]

const nextConfig: NextConfig = {
  // The browser tests build the site into their own folder, so running them never disturbs `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Put title, description, canonical and social tags in <head> for every visitor, including Googlebot.
  // By default only a list of HTML-only bots gets them there; everyone else gets them streamed into the
  // body, which is not valid head metadata. Our metadata comes from cached reads, so waiting costs little.
  htmlLimitedBots: /.*/,
  // Product photographs are served from Cloudinary (uploaded through the admin in Phase 9).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
    formats: ["image/avif", "image/webp"],
  },
  // Catalogue reads: fresh for 1 min in the browser, refreshed in the background after 5 min, dropped after 1 h.
  // Admin edits revalidate by tag (Phase 9), so these lifetimes only bound how stale a missed edit can be.
  cacheLife: {
    catalog: { stale: 60, revalidate: 300, expire: 3600 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
