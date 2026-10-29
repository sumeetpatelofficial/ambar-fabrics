import { allocate, mulDivRound } from "@/lib/money"

/**
 * Order totals, in integer paise, as one pure function so the cart page, checkout and the stored order
 * all use the same arithmetic. Order of operations (see docs/inventory-and-measurements.md section 3):
 *   1. line subtotals (already rounded once per line)
 *   2. the coupon, shared across lines so the parts add up to the coupon exactly
 *   3. shipping, decided on the merchandise total after the discount
 *   4. tax per line (inside the price when inclusive, on top when exclusive)
 */

export type CouponRule =
  | { type: "percent"; percent: number; maxDiscountPaise?: number }
  | { type: "flat"; amountPaise: number }

export type TotalsInput = {
  lines: { id: string; linePaise: number; taxRatePercent?: number }[]
  coupon?: CouponRule
  shipping: { flatRatePaise: number; freeThresholdPaise?: number }
  tax: { enabled: boolean; mode: "inclusive" | "exclusive"; defaultRatePercent: number }
}

export type LineTotals = {
  id: string
  linePaise: number
  discountPaise: number
  /** After the discount, before any exclusive tax. */
  netPaise: number
  taxPaise: number
  taxRatePercent: number
}

export type Totals = {
  lines: LineTotals[]
  subtotalPaise: number
  discountPaise: number
  shippingPaise: number
  taxPaise: number
  /** True when tax is added on top of the prices; false when it is already inside them. */
  taxExclusive: boolean
  totalPaise: number
}

/** The discount a coupon gives on `subtotal`: never more than the subtotal, never negative. */
export function couponDiscount(subtotalPaise: number, coupon: CouponRule | undefined): number {
  if (!coupon || subtotalPaise <= 0) return 0
  let amount =
    coupon.type === "flat"
      ? coupon.amountPaise
      : // percent is a whole number or a number with up to two decimals: work in basis points
        mulDivRound(subtotalPaise, Math.round(coupon.percent * 100), 10_000)
  if (coupon.type === "percent" && coupon.maxDiscountPaise !== undefined)
    amount = Math.min(amount, coupon.maxDiscountPaise)
  return Math.max(0, Math.min(amount, subtotalPaise))
}

export function computeTotals(input: TotalsInput): Totals {
  const subtotalPaise = input.lines.reduce((sum, l) => sum + l.linePaise, 0)
  const discountPaise = couponDiscount(subtotalPaise, input.coupon)
  const shares =
    discountPaise > 0
      ? allocate(
          discountPaise,
          input.lines.map((l) => l.linePaise)
        )
      : null

  const exclusive = input.tax.enabled && input.tax.mode === "exclusive"
  const lines: LineTotals[] = input.lines.map((l, i) => {
    const discount = shares?.[i] ?? 0
    const net = l.linePaise - discount
    const rate = input.tax.enabled ? (l.taxRatePercent ?? input.tax.defaultRatePercent) : 0
    const basisPoints = Math.round(rate * 100)
    const taxPaise =
      rate === 0
        ? 0
        : exclusive
          ? mulDivRound(net, basisPoints, 10_000)
          : mulDivRound(net, basisPoints, 10_000 + basisPoints) // the tax inside a price that includes it
    return {
      id: l.id,
      linePaise: l.linePaise,
      discountPaise: discount,
      netPaise: net,
      taxPaise,
      taxRatePercent: rate,
    }
  })

  const merchandise = subtotalPaise - discountPaise
  const free =
    input.shipping.freeThresholdPaise !== undefined &&
    merchandise >= input.shipping.freeThresholdPaise
  const shippingPaise = lines.length === 0 || free ? 0 : input.shipping.flatRatePaise
  const taxPaise = lines.reduce((sum, l) => sum + l.taxPaise, 0)
  return {
    lines,
    subtotalPaise,
    discountPaise,
    shippingPaise,
    taxPaise,
    taxExclusive: exclusive,
    totalPaise: merchandise + shippingPaise + (exclusive ? taxPaise : 0),
  }
}
