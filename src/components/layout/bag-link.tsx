"use client"

import Link from "next/link"
import { ShoppingBag } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { useBag } from "@/stores/bag-store"

/** Header bag link with a count of distinct items. The count appears after the stored bag has loaded. */
export function BagLink() {
  const count = useBag((s) => (s.hydrated ? s.lines.length : 0))
  return (
    <Link
      href="/cart"
      aria-label={count > 0 ? `Bag, ${count} ${count === 1 ? "item" : "items"}` : "Bag"}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
    >
      <ShoppingBag aria-hidden="true" className="size-5" />
      {count > 0 ? (
        <span className="tabular absolute top-1 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] leading-4 text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Link>
  )
}
