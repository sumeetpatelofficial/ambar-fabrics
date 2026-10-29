import "server-only"
import mongoose, { type PipelineStage, type QueryFilter } from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { Product, type ProductDoc } from "@/models/product"
import type { Id } from "@/models/_shared"
import type { Facets, FacetValue } from "@/features/catalog/types"
import type { Sort } from "@/features/catalog/schemas"

// Mongoose's sanitizeFilter is on globally, so operator objects we build ourselves must be marked
// trusted. User input only ever reaches these as plain values (strings, numbers, ObjectIds).
const trusted = mongoose.trusted

export type ListCriteria = {
  categoryIds?: Id[]
  productIds?: Id[]
  flag?: "featured" | "bestseller" | "newArrival"
  onSale?: boolean
  slugs?: string[]
  tag?: string
  /** Already sanitised search text (see sanitizeSearchText). */
  q?: string
  minPaise?: number
  maxPaise?: number
  fabric: string[]
  color: string[]
  pattern: string[]
  inStockOnly?: boolean
  sort: Sort
  page: number
  pageSize: number
}

type Filters = Pick<
  ListCriteria,
  "minPaise" | "maxPaise" | "fabric" | "color" | "pattern" | "inStockOnly"
>

/** Which products are candidates at all: published, in the category/collection, matching the search. */
export function buildScope(c: ListCriteria): QueryFilter<ProductDoc> {
  // variantCount >= 1: a product with nothing to buy is never listed, whatever its status says.
  const scope: QueryFilter<ProductDoc> = { status: "active", variantCount: trusted({ $gte: 1 }) }
  if (c.categoryIds?.length) scope.categoryIds = trusted({ $in: c.categoryIds })
  if (c.productIds) scope._id = trusted({ $in: c.productIds })
  if (c.flag) scope[`flags.${c.flag}`] = true
  if (c.onSale) scope["priceRange.compareAtMinPaise"] = trusted({ $exists: true })
  if (c.slugs) scope.slug = trusted({ $in: c.slugs })
  if (c.tag) scope.tags = c.tag
  if (c.q) scope.$text = trusted({ $search: c.q })
  return scope
}

/** The narrowing filters a visitor chooses. `omit` drops one dimension, used when counting its facet. */
export function buildFilters(
  f: Filters,
  omit?: "fabric" | "color" | "pattern" | "price"
): QueryFilter<ProductDoc> {
  const out: QueryFilter<ProductDoc> = {}
  if (omit !== "price") {
    // A product matches when any of its variant prices falls in the range: its price span overlaps it.
    if (f.minPaise !== undefined) out["priceRange.maxPaise"] = trusted({ $gte: f.minPaise })
    if (f.maxPaise !== undefined) out["priceRange.minPaise"] = trusted({ $lte: f.maxPaise })
  }
  if (omit !== "fabric" && f.fabric.length)
    out["attributes.fabricType"] = trusted({ $in: f.fabric })
  if (omit !== "color" && f.color.length) out["attributes.colorFamily"] = trusted({ $in: f.color })
  if (omit !== "pattern" && f.pattern.length)
    out["attributes.pattern"] = trusted({ $in: f.pattern })
  if (f.inStockOnly) out.inStock = true
  return out
}

export function buildSort(
  c: Pick<ListCriteria, "sort" | "q">
): Record<string, 1 | -1 | { $meta: "textScore" }> {
  switch (c.sort) {
    case "newest":
      return { publishedAt: -1, _id: 1 }
    case "price_asc":
      return { "priceRange.minPaise": 1, _id: 1 }
    case "price_desc":
      return { "priceRange.maxPaise": -1, _id: 1 }
    case "popular":
      return { soldCount: -1, publishedAt: -1, _id: 1 }
    default:
      // "Relevance" means text score when searching, otherwise newest first (which uses the listing index).
      return c.q ? { score: { $meta: "textScore" }, _id: 1 } : { publishedAt: -1, _id: 1 }
  }
}

export function buildListQuery(c: ListCriteria) {
  return {
    filter: { ...buildScope(c), ...buildFilters(c) } as QueryFilter<ProductDoc>,
    sort: buildSort(c),
  }
}

export const productRepository = {
  async list(c: ListCriteria): Promise<{ items: ProductDoc[]; total: number }> {
    await connectDb()
    const { filter, sort } = buildListQuery(c)
    const query = Product.find(filter)
    if (c.q) query.select({ score: { $meta: "textScore" } })
    const [items, total] = await Promise.all([
      query
        .sort(sort)
        .skip((c.page - 1) * c.pageSize)
        .limit(c.pageSize)
        .lean<ProductDoc[]>(),
      Product.countDocuments(filter),
    ])
    return { items, total }
  },

  /** Counts per filter option. Each option list ignores its own selection so other values stay clickable. */
  async facets(c: ListCriteria): Promise<Facets> {
    await connectDb()
    const group = (path: string, unwind: boolean): PipelineStage.FacetPipelineStage[] => [
      ...(unwind ? [{ $unwind: `$${path}` }] : []),
      { $match: { [path]: { $type: "string" } } },
      { $group: { _id: `$${path}`, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 40 },
    ]
    const [result] = await Product.aggregate<{
      fabric: { _id: string; count: number }[]
      color: { _id: string; count: number }[]
      pattern: { _id: string; count: number }[]
      price: { min: number; max: number }[]
    }>([
      // Aggregation does not cast or sanitise, but every value here is an ObjectId or a validated primitive.
      { $match: buildScope(c) as Record<string, unknown> },
      {
        $facet: {
          fabric: [
            { $match: buildFilters(c, "fabric") as Record<string, unknown> },
            ...group("attributes.fabricType", false),
          ],
          color: [
            { $match: buildFilters(c, "color") as Record<string, unknown> },
            ...group("attributes.colorFamily", true),
          ],
          pattern: [
            { $match: buildFilters(c, "pattern") as Record<string, unknown> },
            ...group("attributes.pattern", false),
          ],
          price: [
            { $match: buildFilters(c, "price") as Record<string, unknown> },
            { $match: { priceRange: { $exists: true } } },
            {
              $group: {
                _id: null,
                min: { $min: "$priceRange.minPaise" },
                max: { $max: "$priceRange.maxPaise" },
              },
            },
          ],
        },
      },
    ])
    const values = (rows: { _id: string; count: number }[] = []): FacetValue[] =>
      rows.map((r) => ({ value: r._id, count: r.count }))
    return {
      fabric: values(result?.fabric),
      color: values(result?.color),
      pattern: values(result?.pattern),
      price: result?.price[0]
        ? { minPaise: result.price[0].min, maxPaise: result.price[0].max }
        : null,
    }
  },

  async findActiveBySlug(slug: string): Promise<ProductDoc | null> {
    await connectDb()
    return Product.findOne({ slug, status: "active" }).lean<ProductDoc>()
  },

  async findActiveByIds(ids: Id[]): Promise<ProductDoc[]> {
    await connectDb()
    return Product.find({ _id: trusted({ $in: ids }), status: "active" }).lean<ProductDoc[]>()
  },

  async related(categoryId: Id | undefined, excludeId: Id, limit: number): Promise<ProductDoc[]> {
    await connectDb()
    const filter: QueryFilter<ProductDoc> = { status: "active", _id: trusted({ $ne: excludeId }) }
    if (categoryId) filter.categoryIds = categoryId
    return Product.find(filter)
      .sort({ soldCount: -1, publishedAt: -1, _id: 1 })
      .limit(limit)
      .lean<ProductDoc[]>()
  },

  /** Anchored on a word start, case-insensitive. `pattern` must already be regex-escaped. */
  async suggest(pattern: string, limit: number): Promise<ProductDoc[]> {
    await connectDb()
    return Product.find({ status: "active", name: new RegExp(`(^|\\s)${pattern}`, "i") })
      .sort({ soldCount: -1, _id: 1 })
      .limit(limit)
      .lean<ProductDoc[]>()
  },

  async setSummary(id: Id, summary: Partial<ProductDoc>): Promise<void> {
    await connectDb()
    await Product.updateOne({ _id: id }, { $set: summary })
  },
}
