"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { ChoiceSelect } from "@/components/ui/choice-select"
import { listingHref, type ListingState } from "@/features/catalog/listing"
import type { Sort } from "@/features/catalog/schemas"

const LABELS: Record<Sort, string> = {
  relevance: "Featured",
  newest: "Newest",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
  popular: "Most popular",
}

/** Sort control. Changing it keeps every filter and returns to page 1. */
export function SortSelect({
  basePath,
  state,
  defaultSort,
  options,
  relevanceLabel = "Featured",
}: {
  basePath: string
  state: ListingState
  defaultSort: Sort
  options: Sort[]
  relevanceLabel?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="sort" className="text-muted-foreground">
        Sort by
      </label>
      <ChoiceSelect
        id="sort"
        value={state.sort}
        disabled={pending}
        onChange={(value) =>
          startTransition(() =>
            router.push(
              listingHref(basePath, { ...state, sort: value as Sort, page: 1 }, defaultSort)
            )
          )
        }
        className="h-10 w-auto min-w-36"
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value === "relevance" ? relevanceLabel : LABELS[value]}
          </option>
        ))}
      </ChoiceSelect>
    </div>
  )
}
