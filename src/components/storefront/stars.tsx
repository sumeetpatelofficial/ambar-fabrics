import { Star } from "lucide-react"
import { cn } from "cn"

/**
 * A rating as five stars, with the same information in words for screen readers. The stars are drawn from
 * the number (half stars rounded to the nearest half); the label is what assistive technology reads.
 */
export function Stars({
  value,
  count,
  size = "md",
  className,
}: {
  value: number
  count?: number
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const px = size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-4.5"
  const rounded = Math.round(value * 2) / 2
  const label = `${value.toFixed(1)} out of 5${count !== undefined ? `, ${count} ${count === 1 ? "review" : "reviews"}` : ""}`
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span role="img" aria-label={label} className="inline-flex">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = rounded >= n ? 1 : rounded >= n - 0.5 ? 0.5 : 0
          return (
            <span key={n} className={cn("relative inline-block", px)} aria-hidden="true">
              <Star className={cn("absolute inset-0 text-brass/40", px)} strokeWidth={1.5} />
              {fill > 0 ? (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star className={cn("fill-brass text-brass", px)} strokeWidth={1.5} />
                </span>
              ) : null}
            </span>
          )
        })}
      </span>
      {count !== undefined ? (
        <span className="tabular text-xs text-muted-foreground" aria-hidden="true">
          ({count})
        </span>
      ) : null}
    </span>
  )
}
