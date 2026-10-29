import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Fragment } from "react"

export type Crumb = { label: string; href?: string }

/** The last crumb is the current page. Structured data for these is added in Phase 10. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <Fragment key={`${item.label}-${i}`}>
              <BreadcrumbItem className="uppercase">
                {last || !item.href ? (
                  <BreadcrumbPage className="tracking-wider">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink className="tracking-wider" render={<Link href={item.href} />}>
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
