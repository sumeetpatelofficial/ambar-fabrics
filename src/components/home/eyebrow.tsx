import type { ReactNode } from "react"
import { cn } from "cn"

/** The small uppercase label above a heading. */
export function Eyebrow({
  children,
  tone = "accent",
  className,
}: {
  children: ReactNode
  tone?: "accent" | "muted" | "gold"
  className?: string
}) {
  return (
    <div
      className={cn(
        "text-xs font-semibold tracking-[0.18em] uppercase",
        tone === "accent" && "text-highlight",
        tone === "muted" && "text-muted-foreground",
        tone === "gold" && "text-gold-dark",
        className
      )}
    >
      {children}
    </div>
  )
}
