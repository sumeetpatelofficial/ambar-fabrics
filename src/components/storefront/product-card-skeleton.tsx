import { Skeleton } from "@/components/ui/skeleton"

/** Matches ProductCard's box model (4:5 image, two text lines) so loading causes no layout shift. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <div className="flex flex-col gap-2 pt-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading products">
      <span className="sr-only">Loading products</span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
