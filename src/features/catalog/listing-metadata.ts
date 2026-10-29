import type { Metadata } from "next"
import { isIndexableView, parseListingParams } from "@/features/catalog/listing"
import type { ProductListQuery, Sort } from "@/features/catalog/schemas"
import { buildMetadata } from "@/lib/seo/metadata"
import { cachedListProducts } from "@/services/catalog-cache"

type Raw = Record<string, string | string[] | undefined>

/**
 * Metadata for listing pages. The plain page and its numbered pages are indexable and self-canonical;
 * filtered, sorted, searched or empty views are `noindex, follow` so thin duplicates stay out of results.
 */
export async function listingMetadata(opts: {
  title: string
  description?: string
  basePath: string
  searchParams: Promise<Raw>
  defaultSort?: Sort
  /** What the page fixes about its list (category, flag...), so page numbers can be checked against the real total. */
  constraint?: Partial<
    Pick<ProductListQuery, "category" | "collection" | "flag" | "onSale" | "fabric" | "pattern">
  >
  /** Never index (search results). */
  noindex?: boolean
  image?: { url: string; alt?: string }
}): Promise<Metadata> {
  const defaultSort = opts.defaultSort ?? "relevance"
  const parsed = parseListingParams(await opts.searchParams)
  const state = { ...parsed, sort: parsed.sort === "relevance" ? defaultSort : parsed.sort }
  let indexable = !opts.noindex && isIndexableView(state, defaultSort)
  if (indexable && state.page > 1) {
    // A page number past the last page is an empty duplicate, not a page worth indexing.
    const result = await cachedListProducts({ ...parsed, sort: state.sort, ...opts.constraint })
    if (!result || state.page > result.totalPages) indexable = false
  }
  const paged = indexable && state.page > 1
  return buildMetadata({
    title: paged ? `${opts.title}, page ${state.page}` : opts.title,
    description: opts.description,
    path: paged ? `${opts.basePath}?page=${state.page}` : opts.basePath,
    noindex: !indexable,
    image: opts.image,
  })
}
