"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/** Sample suggestions. Live suggestions from the catalogue arrive with search in Phase 3/4. */
const popular = [
  "Cotton fabric",
  "Bandhani dupatta",
  "Ajrakh print",
  "Modal silk",
  "Unstitched suit",
]

/**
 * Search panel. It is a plain GET form to /search, so it works without JavaScript and the results page
 * stays shareable and indexable-by-policy. The input takes focus when the panel opens.
 */
export function SearchOverlay() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Search" />}>
        <Search aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="top"
        showCloseButton
        initialFocus={inputRef}
        className="gap-0 px-4 pt-6 pb-8 sm:px-6"
      >
        <div className="mx-auto w-full max-w-3xl">
          <SheetTitle className="font-display text-3xl font-normal">Search</SheetTitle>
          <SheetDescription className="sr-only">
            Search fabrics, dupattas, blouses and ready-made clothing.
          </SheetDescription>
          <form action="/search" method="get" role="search" className="mt-4 flex gap-2">
            <label htmlFor="site-search" className="sr-only">
              Search products
            </label>
            <Input
              ref={inputRef}
              id="site-search"
              name="q"
              type="search"
              required
              minLength={2}
              maxLength={80}
              autoComplete="off"
              placeholder="Try cotton, bandhani or dupatta"
              className="h-12 flex-1 text-base"
            />
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>
          <div className="mt-6">
            <p className="mb-2 text-sm text-muted-foreground">Popular searches</p>
            <ul className="flex flex-wrap gap-2">
              {popular.map((term) => (
                <li key={term}>
                  <Link
                    href={`/search?q=${encodeURIComponent(term)}`}
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-10 items-center border px-3 text-sm transition-colors hover:bg-muted"
                  >
                    {term}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
