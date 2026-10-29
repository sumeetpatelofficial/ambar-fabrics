import Link from "next/link"
import { SearchX } from "lucide-react"
import { notFound } from "next/navigation"
import { TrackSearch } from "@/components/analytics/track-events"
import { PageHeader, type PageHeaderProps } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/storefront/empty-state"
import { ProductGrid } from "@/components/storefront/product-grid"
import { ActiveFilters } from "@/components/storefront/listing/active-filters"
import { FilterDrawer } from "@/components/storefront/listing/filter-drawer"
import { FilterForm } from "@/components/storefront/listing/filter-form"
import { Pagination } from "@/components/storefront/listing/pagination"
import { SortSelect } from "@/components/storefront/listing/sort-select"
import { activeFilterChips, listingHref, parseListingParams } from "@/features/catalog/listing"
import type { ProductListQuery, Sort } from "@/features/catalog/schemas"
import { cachedListProducts } from "@/services/catalog-cache"

type Raw = Record<string, string | string[] | undefined>

/** What a page fixes about its list (a category, a flag...); the visitor's filters are added on top. */
export type ListingConstraint = Partial<
  Pick<ProductListQuery, "category" | "collection" | "flag" | "onSale" | "fabric" | "pattern">
>

/**
 * The filterable, sortable, paginated product list shared by shop, category, collection, search and
 * the curated lists. State lives in the URL.
 */
export async function ListingView({
  searchParams,
  basePath,
  constraint = {},
  defaultSort = "relevance",
  sortOptions = ["relevance", "newest", "price_asc", "price_desc", "popular"],
  emptyTitle = "No products match those filters",
  emptyDescription = "Try removing a filter, or browse everything.",
  relevanceLabel,
  trackSearch,
  header,
}: {
  searchParams: Promise<Raw>
  basePath: string
  constraint?: ListingConstraint
  defaultSort?: Sort
  sortOptions?: Sort[]
  emptyTitle?: string
  emptyDescription?: string
  relevanceLabel?: string
  /** The search words, when this list is a search result (reported to analytics with the result count). */
  trackSearch?: string
  /** The page heading. It is drawn here so the product count and sorting can sit at its right. */
  header: Omit<PageHeaderProps, "aside">
}) {
  const parsed = parseListingParams(await searchParams)
  // A bare URL means "this page's default order"; an explicit sort in the URL always wins.
  const sort = parsed.sort === "relevance" ? defaultSort : parsed.sort
  const query: ProductListQuery = { ...parsed, sort, ...constraint }
  const result = await cachedListProducts(query)
  if (!result) notFound()

  const state = { ...parsed, sort }
  const chips = activeFilterChips(state)
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
  const to = Math.min(result.total, result.page * result.pageSize)
  const pastEnd = result.total > 0 && result.items.length === 0

  const toolbar = (
    <>
      <p aria-live="polite" className="tabular text-sm text-muted-foreground">
        {result.total === 0
          ? "No products"
          : result.total <= result.pageSize
            ? `${result.total} ${result.total === 1 ? "product" : "products"}`
            : `Showing ${from} to ${to} of ${result.total}`}
      </p>
      <FilterDrawer
        basePath={basePath}
        state={state}
        facets={result.facets}
        defaultSort={defaultSort}
        activeCount={chips.length}
      />
      <SortSelect
        basePath={basePath}
        state={state}
        defaultSort={defaultSort}
        options={sortOptions}
        relevanceLabel={relevanceLabel}
      />
    </>
  )

  return (
    <>
      <PageHeader {...header} aside={toolbar} divider />
      <div className="flex flex-col gap-6">
        {trackSearch ? <TrackSearch term={trackSearch} count={result.total} /> : null}
        <ActiveFilters basePath={basePath} state={state} defaultSort={defaultSort} />

        <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
          <aside aria-label="Filters" className="max-lg:hidden">
            <div className="sticky top-24 -mx-1 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain px-1 pb-4">
              <FilterForm
                basePath={basePath}
                state={state}
                facets={result.facets}
                defaultSort={defaultSort}
                autoApply
              />
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-12">
            {result.items.length > 0 ? (
              <ProductGrid
                items={result.items}
                columns="three"
                headingLevel={2}
                listName={basePath}
                quickAdd
                className="lg:grid-cols-3 xl:grid-cols-4"
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title={pastEnd ? "That page does not exist" : emptyTitle}
                description={
                  pastEnd
                    ? "There are fewer pages than that. Go back to the first page."
                    : emptyDescription
                }
                action={
                  <Link
                    href={listingHref(
                      basePath,
                      chips.length || pastEnd ? { q: state.q } : {},
                      defaultSort
                    )}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    {chips.length || pastEnd ? "Clear filters" : "Back to all products"}
                  </Link>
                }
              />
            )}
            <Pagination
              basePath={basePath}
              state={state}
              totalPages={result.totalPages}
              defaultSort={defaultSort}
            />
          </div>
        </div>
      </div>
    </>
  )
}
