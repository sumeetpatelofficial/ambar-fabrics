import { connection } from "next/server"
import type { Metadata } from "next"
import type { PageSlug } from "@/config/pages"
import { buildMetadata } from "@/lib/seo/metadata"
import { cachedPage } from "@/services/catalog-cache"

/** Title and description from the page as the owner has worded it, so a renamed page is renamed in search results too. */
export async function pageMetadata(slug: PageSlug): Promise<Metadata> {
  await connection()
  const page = await cachedPage(slug)
  return buildMetadata({ title: page.title, description: page.description, path: `/${slug}` })
}
