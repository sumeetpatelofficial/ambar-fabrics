import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "cn"
import { PriceTag } from "@/components/storefront/price-tag"
import { Stars } from "@/components/storefront/stars"
import { CardMedia } from "@/components/storefront/card-media"

export type Swatch = { name: string; hex: string }

export type ProductCardProps = {
  href: string
  name: string
  /** Rendered nodes (next/image or a placeholder) so the card does not own image loading. */
  primary: ReactNode
  secondary?: ReactNode
  pricePaise: number
  comparePaise?: number
  /** For example "per metre", "per set", "per pair". */
  unitLabel?: string
  badge?: string
  swatches?: Swatch[]
  soldOut?: boolean
  rating?: { avg: number; count: number }
  /** Top-right controls, such as a WishlistButton. They sit above the card link. */
  actions?: ReactNode
  /** Controls under the details, such as a quantity and an add button. They sit above the card link. */
  footer?: ReactNode
  /** 2 when the card sits directly under the page title, 3 (default) under a section heading. */
  headingLevel?: 2 | 3
  /** Shape of the picture: square (lists) or 4:5 portrait (the home page). */
  ratio?: "square" | "portrait"
  className?: string
}

/**
 * The whole card is one link (stretched ::after), with controls layered above it. No shadows or
 * rounded frames: a hairline and the photograph carry it.
 */
export function ProductCard({
  href,
  name,
  primary,
  secondary,
  pricePaise,
  comparePaise,
  unitLabel,
  badge,
  swatches,
  soldOut,
  rating,
  actions,
  footer,
  headingLevel = 3,
  ratio = "square",
  className,
}: ProductCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-lg border p-3 shadow-md",
        className
      )}
    >
      <div className="relative">
        <CardMedia primary={primary} secondary={secondary} ratio={ratio} />
        {badge ? (
          <span className="absolute top-3 left-3 rounded-[2px] bg-offer px-2 py-1 text-[0.6875rem] font-bold tracking-[0.06em] text-offer-foreground uppercase">
            {badge}
          </span>
        ) : null}
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/80 py-2 text-center text-sm text-background">
            Sold out
          </span>
        ) : null}
        {actions ? <div className="absolute top-2 right-2 z-10">{actions}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 pt-3">
        {/* Always room for two lines, so the price sits at the same height on every card in a row. */}
        <Heading className="line-clamp-2 min-h-[2.75rem] font-sans text-base leading-snug font-medium text-pretty">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-offset-4"
          >
            {name}
          </Link>
        </Heading>
        <PriceTag
          pricePaise={pricePaise}
          comparePaise={comparePaise}
          unitLabel={unitLabel}
          reserveSaleRow
        />
        {rating ? <Stars value={rating.avg} count={rating.count} size="sm" /> : null}
        {swatches && swatches.length > 0 ? (
          <ul className="flex items-center gap-1.5 pt-0.5" aria-label="Available colours">
            {swatches.slice(0, 6).map((s) => (
              <li key={s.name}>
                <span
                  className="block size-3.5 rounded-full border border-foreground/20"
                  style={{ backgroundColor: s.hex }}
                  title={s.name}
                />
                <span className="sr-only">{s.name}</span>
              </li>
            ))}
            {swatches.length > 6 ? (
              <li className="text-xs text-muted-foreground">+{swatches.length - 6}</li>
            ) : null}
          </ul>
        ) : null}
        {footer ? <div className="relative z-10 mt-auto pt-2">{footer}</div> : null}
      </div>
    </article>
  )
}
