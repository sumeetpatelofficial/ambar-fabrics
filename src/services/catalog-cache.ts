import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import type { ProductListQuery } from "@/features/catalog/schemas"
import * as catalog from "@/services/catalog-service"
import * as reviews from "@/services/review-service"
import * as content from "@/services/content-service"
import type { PageSlug } from "@/config/pages"
import type { TaxonKind } from "@/config/taxa"

/**
 * Cached entry points for pages and API routes. Each wraps a catalogue read in a `use cache` entry with
 * tags so admin edits can invalidate precisely (`catalog`, plus `product:<slug>` and so on). The
 * services stay uncached and unit-testable; only this file knows about Next's cache.
 */

export async function cachedListProducts(query: ProductListQuery) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", "catalog:list")
  return catalog.listProducts(query)
}

export async function cachedProductDetail(slug: string) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", `product:${slug}`)
  return catalog.getProductDetail(slug)
}

export async function cachedRelatedProducts(slug: string) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", `product:${slug}`)
  return catalog.getRelatedProducts(slug)
}

export async function cachedSuggest(term: string) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", "catalog:list")
  return catalog.suggest(term)
}

export async function cachedCategoryTree() {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", "categories")
  return catalog.getCategoryTree()
}

export async function cachedCategory(slug: string) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", "categories", `category:${slug}`)
  return catalog.getCategoryDetail(slug)
}

export async function cachedCollection(slug: string) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", `collection:${slug}`)
  return catalog.getCollection(slug)
}

export async function cachedPublicSettings() {
  "use cache"
  cacheLife("catalog")
  cacheTag("settings")
  return catalog.getPublicSettings()
}

export async function cachedReviews(slug: string, page: number) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", `reviews:${slug}`)
  return reviews.listApprovedReviews(slug, page)
}

export async function cachedPage(slug: PageSlug) {
  "use cache"
  cacheLife("catalog")
  cacheTag("pages", `page:${slug}`)
  return content.getPage(slug)
}

export async function cachedTaxa(kind: TaxonKind) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", "taxa")
  return catalog.listTaxaPublic(kind)
}

export async function cachedTaxon(kind: TaxonKind, slug: string) {
  "use cache"
  cacheLife("catalog")
  cacheTag("catalog", "taxa", `taxon:${kind}:${slug}`)
  return catalog.getTaxonPublic(kind, slug)
}
