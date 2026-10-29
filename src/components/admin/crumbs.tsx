import Link from "next/link"
import { ArrowLeft, ChevronRight } from "lucide-react"

export type Crumb = { label: string; href?: string }

/**
 * Where you are, with a Back link to the page above. The last item is the current page and is not a link.
 * Example: Categories, Fabrics, Cotton: Back goes to Fabrics.
 */
export function Crumbs({ trail }: { trail: Crumb[] }) {
  const parent = [...trail].reverse().find((c) => c.href)
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {parent ? (
        <Link
          href={parent.href!}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 hover:bg-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back<span className="sr-only"> to {parent.label}</span>
        </Link>
      ) : null}
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          <li>
            <Link href="/admin" className="underline-offset-4 hover:underline">
              Admin
            </Link>
          </li>
          {trail.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              <ChevronRight aria-hidden="true" className="size-3.5" />
              {c.href ? (
                <Link href={c.href} className="underline-offset-4 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}
