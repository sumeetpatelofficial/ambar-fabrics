import { describe, expect, it } from "vitest"
import { computeTotals, couponDiscount, type TotalsInput } from "@/lib/pricing/totals"

const noTax = { enabled: false, mode: "inclusive", defaultRatePercent: 5 } as const
const base = (over: Partial<TotalsInput> = {}): TotalsInput => ({
  lines: [
    { id: "a", linePaise: 45000 },
    { id: "b", linePaise: 119900 },
  ],
  shipping: { flatRatePaise: 8000, freeThresholdPaise: 150000 },
  tax: noTax,
  ...over,
})

describe("shipping", () => {
  it("charges the flat rate under the threshold and nothing at or above it", () => {
    expect(computeTotals(base({ lines: [{ id: "a", linePaise: 149999 }] })).shippingPaise).toBe(
      8000
    )
    expect(computeTotals(base({ lines: [{ id: "a", linePaise: 150000 }] })).shippingPaise).toBe(0)
  })
  it("decides on the total after the discount", () => {
    const t = computeTotals(
      base({
        lines: [{ id: "a", linePaise: 160000 }],
        coupon: { type: "flat", amountPaise: 20000 },
      })
    )
    expect(t.shippingPaise).toBe(8000) // 1,400 after the coupon is under 1,500
    expect(t.totalPaise).toBe(140000 + 8000)
  })
  it("has no threshold when none is set, and no charge for an empty order", () => {
    expect(computeTotals(base({ shipping: { flatRatePaise: 5000 } })).shippingPaise).toBe(5000)
    expect(computeTotals(base({ lines: [] })).totalPaise).toBe(0)
  })
})

describe("coupons", () => {
  it("takes a percentage, rounded once, capped, and never above the subtotal", () => {
    expect(couponDiscount(164900, { type: "percent", percent: 10 })).toBe(16490)
    expect(couponDiscount(33333, { type: "percent", percent: 15 })).toBe(5000) // 4999.95 rounds up
    expect(couponDiscount(164900, { type: "percent", percent: 10, maxDiscountPaise: 10000 })).toBe(
      10000
    )
    expect(couponDiscount(5000, { type: "flat", amountPaise: 9000 })).toBe(5000)
    expect(couponDiscount(5000, undefined)).toBe(0)
  })
  it("shares the discount across lines so the parts add up exactly", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const lines = Array.from({ length: (seed % 5) + 1 }, (_, i) => ({
        id: `l${i}`,
        linePaise: ((seed * 7919 + i * 104729) % 90000) + 100,
      }))
      const amountPaise = (seed * 331) % 50000
      const t = computeTotals({
        lines,
        coupon: { type: "flat", amountPaise },
        shipping: { flatRatePaise: 0 },
        tax: noTax,
      })
      expect(t.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(t.discountPaise)
      expect(t.lines.every((l) => l.netPaise >= 0)).toBe(true)
      expect(t.totalPaise).toBe(t.subtotalPaise - t.discountPaise)
    }
  })
})

describe("tax", () => {
  it("is zero while tax is off", () => {
    expect(computeTotals(base()).taxPaise).toBe(0)
  })
  it("inclusive: reports the tax inside the price and leaves the total alone", () => {
    const t = computeTotals(
      base({
        lines: [{ id: "a", linePaise: 105000 }],
        tax: { enabled: true, mode: "inclusive", defaultRatePercent: 5 },
      })
    )
    expect(t.taxPaise).toBe(5000)
    expect(t.totalPaise).toBe(105000 + 8000) // tax is already inside; shipping is not free under 1,500
  })
  it("exclusive: adds the tax on top", () => {
    const t = computeTotals(
      base({
        lines: [{ id: "a", linePaise: 100000, taxRatePercent: 12 }],
        shipping: { flatRatePaise: 0 },
        tax: { enabled: true, mode: "exclusive", defaultRatePercent: 5 },
      })
    )
    expect(t.taxPaise).toBe(12000)
    expect(t.totalPaise).toBe(112000)
    expect(t.taxExclusive).toBe(true)
  })
  it("taxes the discounted amount", () => {
    const t = computeTotals({
      lines: [{ id: "a", linePaise: 100000 }],
      coupon: { type: "flat", amountPaise: 20000 },
      shipping: { flatRatePaise: 0 },
      tax: { enabled: true, mode: "exclusive", defaultRatePercent: 5 },
    })
    expect(t.taxPaise).toBe(4000)
    expect(t.totalPaise).toBe(84000)
  })
})
