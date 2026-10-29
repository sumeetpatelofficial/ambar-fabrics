import { connection } from "next/server"
import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/seo/metadata"
import { getSitemapEntries } from "@/services/seo-service"

/** Every page worth indexing, read from the catalogue each time it is asked for. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  const entries = await getSitemapEntries()
  return entries.map((e) => ({
    url: absoluteUrl(e.path),
    ...(e.lastModified ? { lastModified: e.lastModified } : {}),
    ...(e.priority ? { priority: e.priority } : {}),
  }))
}
