import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "cn"
import { listingHref, paginationItems, type ListingState } from "@/features/catalog/listing"
import type { Sort } from "@/features/catalog/schemas"

const item =
  "inline-flex size-10 items-center justify-center border text-sm transition-colors hover:bg-muted"

/** Numbered pagination made of real links, so every page is crawlable and shareable. */
export function Pagination({
  basePath,
  state,
  totalPages,
  defaultSort,
}: {
  basePath: string
  state: ListingState
  totalPages: number
  defaultSort: Sort
}) {
  if (totalPages <= 1) return null
  const href = (page: number) => listingHref(basePath, { ...state, page }, defaultSort)
  const current = Math.min(state.page, totalPages)
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2">
      {current > 1 ? (
        <Link href={href(current - 1)} rel="prev" aria-label="Previous page" className={item}>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
      {paginationItems(current, totalPages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-label={`Page ${p}`}
            aria-current={p === current ? "page" : undefined}
            className={cn(
              item,
              "tabular",
              p === current && "border-primary bg-primary text-primary-foreground hover:bg-primary"
            )}
          >
            {p}
          </Link>
        )
      )}
      {current < totalPages ? (
        <Link href={href(current + 1)} rel="next" aria-label="Next page" className={item}>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </nav>
  )
}
