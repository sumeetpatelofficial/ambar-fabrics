import "server-only"
import { siteDefaults } from "@/config/site"
import { availability } from "@/lib/inventory"
import { priceUnitLabel } from "@/lib/measure"
import { rupeesToPaise } from "@/lib/money"
import { effectivePrice, summarizeVariants } from "@/features/catalog/pricing"
import type { ProductListQuery } from "@/features/catalog/schemas"
import type {
  BreadcrumbDTO,
  CategoryDetailDTO,
  CategoryDTO,
  TaxonDTO,
  CategoryNodeDTO,
  CollectionDTO,
  ImageDTO,
  ProductCardDTO,
  ProductDetailDTO,
  ProductListDTO,
  PublicSettingsDTO,
  SeoDTO,
  SuggestDTO,
  VariantDTO,
} from "@/features/catalog/types"
import type { CategoryDoc } from "@/models/category"
import type { CollectionDoc } from "@/models/collection"
import type { ProductDoc } from "@/models/product"
import type { ProductVariantDoc } from "@/models/product-variant"
import type { ImageRef, Id, Seo } from "@/models/_shared"
import { categoryRepository } from "@/repositories/category-repository"
import { taxonRepository } from "@/repositories/taxon-repository"
import type { TaxonDoc, TaxonKind } from "@/models/taxon"
import { collectionRepository } from "@/repositories/collection-repository"
import { productRepository, type ListCriteria } from "@/repositories/product-repository"
import { settingsRepository } from "@/repositories/settings-repository"
import { variantRepository } from "@/repositories/variant-repository"

/**
 * Read side of the catalogue. Every function returns plain DTOs, and `null` (not an exception) when
 * something does not exist or is not public, so results are safe to cache and routes decide the status.
 */

// ---------------------------------------------------------------- helpers

export function sanitizeSearchText(raw: string): string {
  // $text treats a leading "-" as negation and quotes as phrases; visitors typing prose should get
  // plain word matching.
  return raw
    .replace(/["\\]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+/, ""))
    .filter(Boolean)
    .join(" ")
    .slice(0, 80)
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const idString = (id: Id) => id.toString()

function toImage(i: ImageRef): ImageDTO {
  return {
    url: i.url,
    alt: i.alt,
    ...(i.width ? { width: i.width } : {}),
    ...(i.height ? { height: i.height } : {}),
  }
}

function sortedImages(images: ImageRef[] | undefined): ImageDTO[] {
  return [...(images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map(toImage)
}

function toSeo(seo: Seo | undefined): SeoDTO | undefined {
  if (!seo) return undefined
  const out: SeoDTO = {}
  if (seo.title) out.title = seo.title
  if (seo.description) out.description = seo.description
  if (seo.canonical) out.canonical = seo.canonical
  if (seo.noindex) out.noindex = true
  if (seo.ogImage) out.ogImage = seo.ogImage
  return Object.keys(out).length ? out : undefined
}

export function toCard(p: ProductDoc, now: Date): ProductCardDTO {
  const images = sortedImages(p.images)
  const min = p.priceRange?.minPaise ?? 0
  const max = p.priceRange?.maxPaise ?? min
  const onSale = p.priceRange?.compareAtMinPaise !== undefined
  const isNew = p.flags?.newArrival && (!p.newUntil || p.newUntil > now)
  return {
    id: idString(p._id),
    slug: p.slug,
    name: p.name,
    image: images[0] ?? null,
    secondImage: images[1] ?? null,
    pricePaise: min,
    priceMaxPaise: max,
    hasPriceRange: max > min,
    ...(onSale ? { comparePaise: p.priceRange?.compareAtMinPaise } : {}),
    unitLabel: p.priceUnitLabel ?? "",
    ...(onSale ? { badge: "Sale" as const } : isNew ? { badge: "New" as const } : {}),
    swatches: (p.swatches ?? []).map((s) => ({ name: s.name, hex: s.hex })),
    soldOut: !p.inStock,
    ...(p.attributes?.pattern ? { pattern: p.attributes.pattern } : {}),
    ...(p.attributes?.fabricType ? { fabricType: p.attributes.fabricType } : {}),
    ...(p.ratingCount > 0 ? { rating: { avg: p.ratingAvg, count: p.ratingCount } } : {}),
  }
}

/** The options a list card can add straight to the bag, for each product in a list (one query for the whole list). */
async function withQuickAdd(
  cards: ProductCardDTO[],
  docs: ProductDoc[],
  now: Date
): Promise<ProductCardDTO[]> {
  if (cards.length === 0) return cards
  const variants = await variantRepository.findActiveByProductIds(docs.map((p) => p._id))
  const byProduct = new Map<string, ProductVariantDoc[]>()
  for (const v of variants) {
    const key = idString(v.productId)
    byProduct.set(key, [...(byProduct.get(key) ?? []), v])
  }
  return cards.map((card, i) => {
    const mine = (byProduct.get(idString(docs[i]!._id)) ?? [])
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((v) => {
        const full = toVariant(v, now)
        return {
          id: full.id,
          label: full.label,
          ...(full.colorName ? { colorName: full.colorName } : {}),
          ...(full.size ? { size: full.size } : {}),
          unit: full.unit,
          unitLabel: full.unitLabel,
          pricePaise: full.pricePaise,
          availability: full.availability,
        }
      })
    return mine.length ? { ...card, quick: mine } : card
  })
}

function toVariant(v: ProductVariantDoc, now: Date): VariantDTO {
  const price = effectivePrice(v, now)
  const label = [v.options?.colorName, v.options?.size].filter(Boolean).join(", ") || v.sku
  return {
    id: idString(v._id),
    sku: v.sku,
    label,
    ...(v.options?.colorName ? { colorName: v.options.colorName } : {}),
    ...(v.options?.colorHex ? { colorHex: v.options.colorHex } : {}),
    ...(v.options?.size ? { size: v.options.size } : {}),
    unit: v.sellingUnit,
    unitLabel: priceUnitLabel(v.sellingUnit),
    pricePaise: price.pricePaise,
    ...(price.comparePaise ? { comparePaise: price.comparePaise } : {}),
    availability: availability(v.sellingUnit, v.stock, v.lowStockThreshold),
    ...(v.imageUrl ? { imageUrl: v.imageUrl } : {}),
  }
}

function toCategory(c: CategoryDoc, parentSlug?: string): CategoryDTO {
  return {
    id: idString(c._id),
    name: c.name,
    slug: c.slug,
    ...(c.description ? { description: c.description } : {}),
    ...(c.image ? { image: toImage(c.image) } : {}),
    ...(parentSlug ? { parentSlug } : {}),
    ...(toSeo(c.seo) ? { seo: toSeo(c.seo) } : {}),
  }
}

function toCollection(c: CollectionDoc): CollectionDTO {
  return {
    id: idString(c._id),
    name: c.name,
    slug: c.slug,
    ...(c.description ? { description: c.description } : {}),
    ...(c.image ? { image: toImage(c.image) } : {}),
    ...(toSeo(c.seo) ? { seo: toSeo(c.seo) } : {}),
  }
}

// ---------------------------------------------------------------- categories

export async function getCategoryTree(): Promise<CategoryNodeDTO[]> {
  const all = await categoryRepository.listActive()
  const bySlugId = new Map(all.map((c) => [idString(c._id), c]))
  const roots = all.filter((c) => !c.parentId || !bySlugId.has(idString(c.parentId)))
  return roots.map((root) => ({
    ...toCategory(root),
    children: all
      .filter((c) => c.parentId && idString(c.parentId) === idString(root._id))
      .map((c) => toCategory(c, root.slug)),
  }))
}

export async function getCategoryDetail(slug: string): Promise<CategoryDetailDTO | null> {
  const category = await categoryRepository.findActiveBySlug(slug)
  if (!category) return null
  const all = await categoryRepository.listActive()
  const parent = category.parentId
    ? all.find((c) => idString(c._id) === idString(category.parentId as Id))
    : undefined
  const breadcrumbs: BreadcrumbDTO[] = [
    ...(parent ? [{ name: parent.name, slug: parent.slug }] : []),
    { name: category.name, slug: category.slug },
  ]
  const children = all
    .filter((c) => c.parentId && idString(c.parentId) === idString(category._id))
    .map((c) => toCategory(c, category.slug))
  return { ...toCategory(category, parent?.slug), breadcrumbs, children }
}

/** A category and its direct children: a product in "Cotton" shows up under "Fabrics" as well. */
async function categoryAndDescendantIds(category: CategoryDoc): Promise<Id[]> {
  const all = await categoryRepository.listActive()
  const children = all.filter((c) => c.parentId && idString(c.parentId) === idString(category._id))
  return [category._id, ...children.map((c) => c._id)]
}

// ---------------------------------------------------------------- listing

export async function listProducts(
  query: ProductListQuery,
  now = new Date()
): Promise<ProductListDTO | null> {
  const criteria: ListCriteria = {
    fabric: query.fabric,
    color: query.color,
    pattern: query.pattern,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.minPrice !== undefined ? { minPaise: rupeesToPaise(String(query.minPrice)) } : {}),
    ...(query.maxPrice !== undefined ? { maxPaise: rupeesToPaise(String(query.maxPrice)) } : {}),
    ...(query.availability === "in_stock" ? { inStockOnly: true } : {}),
    ...(query.flag ? { flag: query.flag } : {}),
    ...(query.onSale ? { onSale: true } : {}),
    ...(query.slugs ? { slugs: query.slugs } : {}),
  }

  let categoryDetail: CategoryDetailDTO | undefined
  if (query.category) {
    const category = await categoryRepository.findActiveBySlug(query.category)
    if (!category) return null
    criteria.categoryIds = await categoryAndDescendantIds(category)
    categoryDetail = (await getCategoryDetail(query.category)) ?? undefined
  }

  let collectionDto: CollectionDTO | undefined
  if (query.collection) {
    const collection = await collectionRepository.findVisibleBySlug(query.collection, now)
    if (!collection) return null
    collectionDto = toCollection(collection)
    if (collection.type === "manual") {
      criteria.productIds = collection.productIds
    } else if (collection.rule) {
      if (collection.rule.flag) criteria.flag = collection.rule.flag
      if (collection.rule.tag) criteria.tag = collection.rule.tag
      if (collection.rule.categoryId && !criteria.categoryIds) {
        const [cat] = await categoryRepository.findByIds([collection.rule.categoryId])
        if (cat) criteria.categoryIds = await categoryAndDescendantIds(cat)
      }
    }
  }

  const text = query.q ? sanitizeSearchText(query.q) : ""
  if (text) {
    // An exact SKU is a precise request ("find this item"), so it beats fuzzy text matching.
    const bySku = await variantRepository.productIdsBySku(text)
    if (bySku.length > 0) {
      criteria.productIds = criteria.productIds
        ? criteria.productIds.filter((id) => bySku.some((s) => idString(s) === idString(id)))
        : bySku
    } else {
      criteria.q = text
    }
  }

  const [{ items, total }, facets] = await Promise.all([
    productRepository.list(criteria),
    productRepository.facets(criteria),
  ])
  return {
    items: await withQuickAdd(
      items.map((p) => toCard(p, now)),
      items,
      now
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    facets,
    ...(categoryDetail ? { category: categoryDetail } : {}),
    ...(collectionDto ? { collection: collectionDto } : {}),
  }
}

// ---------------------------------------------------------------- master fabrics and prints

const toTaxon = (t: TaxonDoc): TaxonDTO => ({
  id: idString(t._id),
  name: t.name,
  slug: t.slug,
  ...(t.description ? { description: t.description } : {}),
})

export async function listTaxaPublic(kind: TaxonKind): Promise<TaxonDTO[]> {
  return (await taxonRepository.listActive(kind)).map(toTaxon)
}

export async function getTaxonPublic(kind: TaxonKind, slug: string): Promise<TaxonDTO | null> {
  const t = await taxonRepository.findActiveBySlug(kind, slug)
  return t ? toTaxon(t) : null
}

/** The product's fabric and print as links, only when they are shown in the shop. */
async function taxaFor(product: ProductDoc) {
  const ids = [product.fabricId, product.printId].filter((x): x is Id => Boolean(x))
  if (ids.length === 0) return {}
  const found = await taxonRepository.findByIds(ids)
  const pick = (id: Id | null | undefined) => {
    const t = id
      ? found.find((f) => idString(f._id) === idString(id) && f.status === "active")
      : undefined
    return t ? { name: t.name, slug: t.slug } : undefined
  }
  const fabric = pick(product.fabricId)
  const print = pick(product.printId)
  return { ...(fabric ? { fabric } : {}), ...(print ? { print } : {}) }
}

// ---------------------------------------------------------------- detail

export async function getProductDetail(
  slug: string,
  now = new Date()
): Promise<ProductDetailDTO | null> {
  const product = await productRepository.findActiveBySlug(slug)
  if (!product) return null
  const variants = await variantRepository.findActiveByProductId(product._id)
  if (variants.length === 0) return null

  const breadcrumbs: BreadcrumbDTO[] = []
  const primary = product.categoryIds[0]
  if (primary) {
    const [category] = await categoryRepository.findByIds([primary])
    if (category) {
      const parent = category.parentId
        ? (await categoryRepository.findByIds([category.parentId]))[0]
        : undefined
      if (parent) breadcrumbs.push({ name: parent.name, slug: parent.slug })
      breadcrumbs.push({ name: category.name, slug: category.slug })
    }
  }

  const a = product.attributes
  return {
    ...toCard(product, now),
    ...(product.shortDescription ? { shortDescription: product.shortDescription } : {}),
    ...(product.description ? { description: product.description } : {}),
    images: sortedImages(product.images),
    attributes: {
      colorFamily: a?.colorFamily ?? [],
      careInstructions: a?.careInstructions ?? [],
      occasion: a?.occasion ?? [],
      ...(a?.fabricType ? { fabricType: a.fabricType } : {}),
      ...(a?.material ? { material: a.material } : {}),
      ...(a?.composition ? { composition: a.composition } : {}),
      ...(a?.pattern ? { pattern: a.pattern } : {}),
      ...(a?.widthMm ? { widthMm: a.widthMm } : {}),
      ...(a?.origin ? { origin: a.origin } : {}),
    },
    returnable: product.returnable,
    ...(await taxaFor(product)),
    variants: variants.map((v) => toVariant(v, now)),
    breadcrumbs,
    ...(toSeo(product.seo) ? { seo: toSeo(product.seo) } : {}),
    updatedAt: product.updatedAt.toISOString(),
  }
}

export async function getRelatedProducts(
  slug: string,
  limit = 8,
  now = new Date()
): Promise<ProductCardDTO[] | null> {
  const product = await productRepository.findActiveBySlug(slug)
  if (!product) return null
  const items = await productRepository.related(product.categoryIds[0], product._id, limit)
  return items.filter((p) => p.variantCount >= 1).map((p) => toCard(p, now))
}

// ---------------------------------------------------------------- suggestions, collections, settings

export async function suggest(term: string, now = new Date()): Promise<SuggestDTO> {
  const pattern = escapeRegex(term.trim())
  const [products, categories] = await Promise.all([
    productRepository.suggest(pattern, 5),
    categoryRepository.suggest(pattern, 3),
  ])
  return {
    products: products
      .filter((p) => p.variantCount >= 1)
      .map((p) => {
        const card = toCard(p, now)
        return {
          slug: card.slug,
          name: card.name,
          image: card.image,
          pricePaise: card.pricePaise,
          unitLabel: card.unitLabel,
        }
      }),
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
  }
}

export async function getCollection(slug: string, now = new Date()): Promise<CollectionDTO | null> {
  const doc = await collectionRepository.findVisibleBySlug(slug, now)
  return doc ? toCollection(doc) : null
}

export async function getPublicSettings(): Promise<PublicSettingsDTO> {
  const doc = await settingsRepository.getDefault()
  return {
    storeName: doc?.store.name ?? siteDefaults.name,
    currency: "INR",
    ...(doc?.announcement.enabled && doc.announcement.text
      ? {
          announcement: {
            text: doc.announcement.text,
            ...(doc.announcement.href ? { href: doc.announcement.href } : {}),
          },
        }
      : {}),
    ...(doc?.shipping.freeThresholdPaise
      ? { freeShippingThresholdPaise: doc.shipping.freeThresholdPaise }
      : {}),
    taxEnabled: doc?.tax.enabled ?? false,
  }
}

// ---------------------------------------------------------------- write side used by seed and admin

/** Recomputes the card summary stored on a product from its active variants. */
export async function refreshProductSummary(productId: Id, now = new Date()): Promise<void> {
  const variants = await variantRepository.findActiveByProductId(productId)
  const { summary } = summarizeVariants(variants, now)
  await productRepository.setSummary(
    productId,
    summary ?? { inStock: false, variantCount: 0, swatches: [] }
  )
}
