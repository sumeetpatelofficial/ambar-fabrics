import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "cn"

/** Page numbers with the first, last and the pages around the current one; the rest collapse to "...". */
export function pageWindow(current: number, last: number): (number | "gap")[] {
  const wanted = new Set(
    [1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last)
  )
  const sorted = [...wanted].sort((a, b) => a - b)
  const out: (number | "gap")[] = []
  for (const p of sorted) {
    const prev = out.at(-1)
    if (typeof prev === "number" && p - prev > 1) out.push("gap")
    out.push(p)
  }
  return out
}

/** Numbered pages made of real links, keeping whatever search and filters are in the address. */
export function Pagination({
  basePath,
  params = {},
  page,
  total,
  pageSize,
}: {
  basePath: string
  params?: Record<string, string | undefined>
  page: number
  total: number
  pageSize: number
}) {
  const last = Math.max(1, Math.ceil(total / pageSize))
  if (last <= 1) return null
  const current = Math.min(Math.max(1, page), last)
  const href = (p: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
    if (p > 1) q.set("page", String(p))
    const qs = q.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  const from = (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)
  const edge = "inline-flex size-9 items-center justify-center rounded-lg border hover:bg-muted"
  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="tabular text-muted-foreground">
        Showing {from} to {to} of {total}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          {current > 1 ? (
            <Link href={href(current - 1)} className={edge} aria-label="Previous page" rel="prev">
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span className={cn(edge, "pointer-events-none opacity-40")} aria-hidden="true">
              <ChevronLeft className="size-4" />
            </span>
          )}
        </li>
        {pageWindow(current, last).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
              ...
            </li>
          ) : (
            <li key={p}>
              <Link
                href={href(p)}
                aria-label={`Page ${p}`}
                aria-current={p === current ? "page" : undefined}
                className={cn(
                  edge,
                  "tabular",
                  p === current &&
                    "border-primary bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {p}
              </Link>
            </li>
          )
        )}
        <li>
          {current < last ? (
            <Link href={href(current + 1)} className={edge} aria-label="Next page" rel="next">
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span className={cn(edge, "pointer-events-none opacity-40")} aria-hidden="true">
              <ChevronRight className="size-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
