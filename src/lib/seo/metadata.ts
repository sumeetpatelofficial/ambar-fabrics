import type { Metadata } from "next"
import { siteDefaults } from "@/config/site"
import { publicEnv } from "@/lib/env/public"

export function absoluteUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`
  return `${publicEnv.NEXT_PUBLIC_APP_URL}${clean === "/" ? "" : clean}`
}

/** One place that turns page facts into metadata, so titles, canonicals and social cards stay consistent. */
export function buildMetadata(input: {
  /** Page title without the site name; the root layout adds " | Ambar". */
  title: string
  description?: string
  /** Canonical path, without filters or sorting: filtered views point at the base page. */
  path: string
  image?: { url: string; alt?: string; width?: number; height?: number }
  /** Keep this URL out of search results (filtered, searched or empty views) while letting links be followed. */
  noindex?: boolean
  type?: "website" | "article"
}): Metadata {
  const canonical = absoluteUrl(input.path)
  const image = input.image
    ? [
        {
          url: input.image.url,
          alt: input.image.alt,
          width: input.image.width,
          height: input.image.height,
        },
      ]
    : undefined
  return {
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    alternates: { canonical },
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      url: canonical,
      siteName: siteDefaults.name,
      locale: "en_IN",
      type: input.type === "article" ? "article" : "website",
      ...(image ? { images: image } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: input.title },
  }
}

/** Trims to a sentence-ish length for meta descriptions (about 155 characters), never mid-word. */
export function truncateDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:.\s-]+$/, "")}…`
}
