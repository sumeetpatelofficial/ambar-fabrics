import { Skeleton } from "@/components/ui/skeleton"

/**
 * Stands in for a form while the page works out who is asking (session, link token). It reserves about
 * the height of the real form, so the page does not jump when the form arrives.
 */
export function AuthFormSkeleton({ fields = 2, extra = 0 }: { fields?: number; extra?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-5">
      <span className="sr-only">Loading</span>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
      {Array.from({ length: extra }, (_, i) => (
        <Skeleton key={`extra-${i}`} className="h-5 w-48" />
      ))}
      <Skeleton className="h-12 w-full" />
    </div>
  )
}
