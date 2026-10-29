import { cn } from "cn"
import { formatPaise, percentOff } from "@/lib/money"

/**
 * Price with its selling unit ("per metre", "per set"). The unit is always shown, because for fabric the
 * number alone is misleading. `comparePaise` is the struck-through original price when on sale.
 */
export function PriceTag({
  pricePaise,
  comparePaise,
  unitLabel,
  reserveSaleRow = false,
  className,
}: {
  pricePaise: number
  comparePaise?: number
  unitLabel?: string
  /** Keep the line for the struck-through price and discount even when there is none, so prices line up across cards. */
  reserveSaleRow?: boolean
  className?: string
}) {
  const off = comparePaise ? percentOff(pricePaise, comparePaise) : 0
  const onSale = off > 0 && Boolean(comparePaise)
  return (
    <div className={cn("tabular flex flex-col gap-0.5", className)}>
      {onSale ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <s className="text-muted-foreground">
            <span className="sr-only">Original price </span>
            {formatPaise(comparePaise!)}
          </s>
          <span className="font-medium text-highlight">{off}% off</span>
        </p>
      ) : reserveSaleRow ? (
        <p aria-hidden="true" className="min-h-5 text-sm" />
      ) : null}
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[1.2em] leading-tight font-semibold">{formatPaise(pricePaise)}</span>
        {unitLabel ? <span className="text-sm text-muted-foreground">{unitLabel}</span> : null}
      </p>
    </div>
  )
}
