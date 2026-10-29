"use client"

import { useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { FilterForm } from "@/components/storefront/listing/filter-form"
import type { ListingState } from "@/features/catalog/listing"
import type { Facets } from "@/features/catalog/types"
import type { Sort } from "@/features/catalog/schemas"

/** Filters in a slide-over panel for small screens. Applying closes it. */
export function FilterDrawer(props: {
  basePath: string
  state: ListingState
  facets: Facets
  defaultSort: Sort
  activeCount: number
}) {
  const [open, setOpen] = useState(false)
  const { activeCount, ...form } = props
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" className="lg:hidden" />}>
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </SheetTrigger>
      <SheetContent side="left" className="w-[90%] max-w-sm gap-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="font-display text-2xl font-normal">Filters</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <FilterForm {...form} onApplied={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
