import { z } from "zod"
import { SLUG_PATTERN } from "@/lib/slug"

const slug = z.string().max(80).regex(SLUG_PATTERN, "must be a valid slug")

/** Accepts one value or a repeated parameter and always yields a bounded array of tidy strings. */
const list = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10)
)

export const SORTS = ["relevance", "newest", "price_asc", "price_desc", "popular"] as const
export type Sort = (typeof SORTS)[number]

export const productListQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: slug.optional(),
    collection: slug.optional(),
    /** Whole rupees, as typed in a filter. Converted to paise by the service. */
    minPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
    maxPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
    fabric: list,
    color: list,
    pattern: list,
    availability: z.enum(["in_stock"]).optional(),
    /** Curated lists: new arrivals, bestsellers, featured. */
    flag: z.enum(["featured", "bestseller", "newArrival"]).optional(),
    /** `onSale=true`: only products whose cheapest variant is currently discounted. */
    onSale: z
      .enum(["true"])
      .transform(() => true as const)
      .optional(),
    /** Look up specific products (used by the wishlist). */
    slugs: z.preprocess(
      (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
      z.array(slug).max(50).optional()
    ),
    sort: z.enum(SORTS).default("relevance"),
    page: z.coerce.number().int().min(1).max(500).default(1),
    pageSize: z.coerce.number().int().min(1).max(60).default(24),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    path: ["minPrice"],
    message: "minimum price cannot be above maximum price",
  })

export type ProductListQuery = z.infer<typeof productListQuerySchema>

export const suggestQuerySchema = z.object({ q: z.string().trim().min(2).max(80) })
export const slugParamSchema = z.object({ slug })

/** Turns repeated URL parameters (`?fabric=a&fabric=b`) into arrays so Zod sees what the visitor sent. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    out[key] = values.length === 1 ? (values[0] as string) : values
  }
  return out
}
