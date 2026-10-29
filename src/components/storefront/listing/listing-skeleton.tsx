import { PageHeader, type PageHeaderProps } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton"

/** Shown while a listing loads. Same overall shape as the page, so nothing jumps when data arrives. */
export function ListingSkeleton({ header }: { header?: Omit<PageHeaderProps, "aside"> }) {
  return (
    <>
      {header ? (
        <PageHeader
          {...header}
          divider
          aside={
            <div aria-hidden="true" className="flex items-center gap-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-10 w-44" />
            </div>
          }
        />
      ) : null}
      <div className="flex flex-col gap-6" aria-hidden="true">
        <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
          <div className="flex flex-col gap-4 max-lg:hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <ProductGridSkeleton count={8} />
        </div>
      </div>
    </>
  )
}
