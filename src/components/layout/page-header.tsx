import type { ReactNode } from "react"
import { Breadcrumbs, type Crumb } from "@/components/storefront/breadcrumbs"

export type PageHeaderProps = {
  title: string
  description?: string
  breadcrumbs?: Crumb[]
  /** Controls shown at the right of the heading (the product count and sorting on lists). */
  aside?: ReactNode
  /** A line between the heading and the page content (used on product lists). */
  divider?: boolean
}

/** Breadcrumbs, one h1 and an optional intro paragraph. Pages use this so headings stay consistent. */
export function PageHeader({ title, description, breadcrumbs, aside, divider }: PageHeaderProps) {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-x-8 gap-y-4 ${divider ? "mb-8 border-b pb-6" : "pb-8"}`}
    >
      <div className="flex min-w-0 flex-col gap-3">
        {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
        <h1 className="text-4xl sm:text-5xl">{title}</h1>
        {description ? (
          <p className="max-w-prose text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {aside ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-1.5">{aside}</div>
      ) : null}
    </header>
  )
}
