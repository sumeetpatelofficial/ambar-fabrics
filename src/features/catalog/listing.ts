import {
  productListQuerySchema,
  type ProductListQuery,
  type Sort,
} from "@/features/catalog/schemas"

/**
 * URL state for listing pages (shop, category, collection, search). The URL is the single source of
 * truth, so views are shareable, refresh-safe and work without JavaScript.
 */
export type ListingState = Pick<
  ProductListQuery,
  "q" | "fabric" | "color" | "pattern" | "minPrice" | "maxPrice" | "availability" | "sort" | "page"
>

type Raw = Record<string, string | string[] | undefined>

/** Parses URL parameters, dropping any value that is invalid instead of failing the whole page. */
export function parseListingParams(raw: Raw): ProductListQuery {
  let input: Raw = { ...raw }
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = productListQuerySchema.safeParse(input)
    if (result.success) return result.data
    const bad = new Set(result.error.issues.map((i) => String(i.path[0])))
    input = Object.fromEntries(Object.entries(input).filter(([key]) => !bad.has(key)))
  }
  return productListQuerySchema.parse({})
}

const FILTER_KEYS = ["fabric", "color", "pattern"] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/** Builds a listing URL, leaving out anything that equals its default so URLs stay short and canonical. */
export function listingHref(
  basePath: string,
  state: Partial<ListingState>,
  defaultSort: Sort = "relevance"
): string {
  const params = new URLSearchParams()
  if (state.q) params.set("q", state.q)
  for (const key of FILTER_KEYS) for (const value of state[key] ?? []) params.append(key, value)
  if (state.minPrice !== undefined) params.set("minPrice", String(state.minPrice))
  if (state.maxPrice !== undefined) params.set("maxPrice", String(state.maxPrice))
  if (state.availability) params.set("availability", state.availability)
  if (state.sort && state.sort !== defaultSort) params.set("sort", state.sort)
  if (state.page && state.page > 1) params.set("page", String(state.page))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export type FilterChip = { id: string; label: string; remove: Partial<ListingState> }

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** One removable chip per active filter. `remove` is the state with just that filter cleared. */
export function activeFilterChips(state: ListingState): FilterChip[] {
  const chips: FilterChip[] = []
  for (const key of FILTER_KEYS) {
    for (const value of state[key]) {
      chips.push({
        id: `${key}:${value}`,
        label: titleCase(value),
        remove: { ...state, [key]: state[key].filter((v) => v !== value), page: 1 },
      })
    }
  }
  if (state.minPrice !== undefined || state.maxPrice !== undefined) {
    const label =
      state.minPrice !== undefined && state.maxPrice !== undefined
        ? `₹${state.minPrice} to ₹${state.maxPrice}`
        : state.minPrice !== undefined
          ? `From ₹${state.minPrice}`
          : `Up to ₹${state.maxPrice}`
    chips.push({
      id: "price",
      label,
      remove: { ...state, minPrice: undefined, maxPrice: undefined, page: 1 },
    })
  }
  if (state.availability) {
    chips.push({
      id: "availability",
      label: "In stock",
      remove: { ...state, availability: undefined, page: 1 },
    })
  }
  return chips
}

/** Filtered, searched or sorted views are thin duplicates of the base page, so they are not indexed. */
export function isIndexableView(state: ListingState, defaultSort: Sort = "relevance"): boolean {
  return (
    !state.q &&
    state.fabric.length === 0 &&
    state.color.length === 0 &&
    state.pattern.length === 0 &&
    state.minPrice === undefined &&
    state.maxPrice === undefined &&
    !state.availability &&
    state.sort === defaultSort
  )
}

/** Page numbers to show: always first and last, a window around the current page, gaps as null. */
export function paginationItems(current: number, total: number, window = 1): (number | null)[] {
  const pages = new Set<number>([1, total])
  for (let p = current - window; p <= current + window; p++) if (p >= 1 && p <= total) pages.add(p)
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1]
    if (prev !== undefined && p - prev > 1) out.push(p - prev === 2 ? prev + 1 : null)
    out.push(p)
  })
  return out
}
