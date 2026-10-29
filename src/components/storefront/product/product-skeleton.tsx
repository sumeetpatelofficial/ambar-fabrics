import { Skeleton } from "@/components/ui/skeleton"

/** Same two-column shape as the product page, so loading does not shift the layout. */
export function ProductSkeleton() {
  return (
    <div role="status" aria-label="Loading product" className="flex flex-col gap-8">
      <span className="sr-only">Loading product</span>
      <Skeleton className="h-5 w-64" />
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}
