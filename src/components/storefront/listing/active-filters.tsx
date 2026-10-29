import Link from "next/link"
import { X } from "lucide-react"
import { activeFilterChips, listingHref, type ListingState } from "@/features/catalog/listing"
import type { Sort } from "@/features/catalog/schemas"

/** One removable chip per active filter, as plain links so they work without JavaScript. */
export function ActiveFilters({
  basePath,
  state,
  defaultSort,
}: {
  basePath: string
  state: ListingState
  defaultSort: Sort
}) {
  const chips = activeFilterChips(state)
  if (chips.length === 0) return null
  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.id}>
          <Link
            href={listingHref(basePath, chip.remove, defaultSort)}
            aria-label={`Remove filter: ${chip.label}`}
            className="inline-flex min-h-9 items-center gap-1.5 border border-highlight/40 bg-highlight/10 px-3 text-sm text-offer transition-colors hover:bg-highlight/20"
          >
            {chip.label}
            <X aria-hidden="true" className="size-3.5" />
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={listingHref(basePath, { q: state.q, sort: state.sort }, defaultSort)}
          className="inline-flex min-h-9 items-center px-2 text-sm underline underline-offset-4"
        >
          Clear all
        </Link>
      </li>
    </ul>
  )
}
