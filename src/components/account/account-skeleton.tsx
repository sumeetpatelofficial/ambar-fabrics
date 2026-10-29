import { Skeleton } from "@/components/ui/skeleton"

/** About the shape of an account page (a heading, a line of text, a grid of cards), so loading does not shift the layout. */
export function AccountSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-8">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
