import { describe, expect, it } from "vitest"
import {
  assertConsistentUnits,
  effectivePrice,
  summarizeVariants,
} from "@/features/catalog/pricing"
import { units } from "@/lib/measure"
import { ValidationError } from "@/lib/errors"
import type { ProductVariantDoc } from "@/models/product-variant"

const NOW = new Date("2026-10-14T06:00:00Z")
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

function variant(over: Partial<ProductVariantDoc> = {}): ProductVariantDoc {
  return {
    sku: "T-1",
    status: "active",
    sortOrder: 0,
    options: { colorName: "Sage", colorHex: "#8a9a7b" },
    sellingUnit: units.perMetre(),
    pricePaise: 18000,
    stock: { onHand: 40_000, reserved: 0 },
    lowStockThreshold: 5_000,
    ...over,
  } as ProductVariantDoc
}

describe("effectivePrice", () => {
  it("uses the regular price when there is no sale", () => {
    expect(effectivePrice(variant(), NOW)).toEqual({ pricePaise: 18000 })
  })

  it("shows a permanent compare-at (MRP) price when it is higher", () => {
    expect(effectivePrice(variant({ compareAtPaise: 22000 }), NOW)).toEqual({
      pricePaise: 18000,
      comparePaise: 22000,
    })
  })

  it("ignores a compare-at price that is not higher than the price", () => {
    expect(effectivePrice(variant({ compareAtPaise: 18000 }), NOW)).toEqual({ pricePaise: 18000 })
  })

  it("applies the sale price inside its window and strikes through the regular price", () => {
    const v = variant({ salePricePaise: 14000, saleStartsAt: days(-1), saleEndsAt: days(1) })
    expect(effectivePrice(v, NOW)).toEqual({ pricePaise: 14000, comparePaise: 18000 })
  })

  it("prefers compare-at as the struck-through price during a sale", () => {
    const v = variant({ compareAtPaise: 20000, salePricePaise: 14000 })
    expect(effectivePrice(v, NOW)).toEqual({ pricePaise: 14000, comparePaise: 20000 })
  })

  it("does not apply a sale that has not started or has ended", () => {
    expect(effectivePrice(variant({ salePricePaise: 14000, saleStartsAt: days(1) }), NOW)).toEqual({
      pricePaise: 18000,
    })
    expect(effectivePrice(variant({ salePricePaise: 14000, saleEndsAt: days(-1) }), NOW)).toEqual({
      pricePaise: 18000,
    })
  })

  it("treats the window edges as inclusive and open-ended windows as always on", () => {
    expect(
      effectivePrice(variant({ salePricePaise: 14000, saleStartsAt: NOW }), NOW).pricePaise
    ).toBe(14000)
    expect(
      effectivePrice(variant({ salePricePaise: 14000, saleEndsAt: NOW }), NOW).pricePaise
    ).toBe(14000)
    expect(effectivePrice(variant({ salePricePaise: 14000 }), NOW).pricePaise).toBe(14000)
  })
})

describe("summarizeVariants", () => {
  it("returns no summary when nothing is active", () => {
    expect(summarizeVariants([], NOW).summary).toBeNull()
    expect(summarizeVariants([variant({ status: "inactive" })], NOW).summary).toBeNull()
  })

  it("computes the price range, unit label, swatches and stock", () => {
    const { summary } = summarizeVariants(
      [
        variant({
          sku: "A",
          pricePaise: 18000,
          options: { colorName: "Sage", colorHex: "#8a9a7b" },
        }),
        variant({
          sku: "B",
          pricePaise: 25000,
          options: { colorName: "Indigo", colorHex: "#3d4a6b" },
        }),
        variant({
          sku: "C",
          pricePaise: 25000,
          options: { colorName: "Sage", colorHex: "#8a9a7b" },
        }), // duplicate colour
      ],
      NOW
    )
    expect(summary).toMatchObject({
      unitKind: "length",
      priceUnitLabel: "per metre",
      priceRange: { minPaise: 18000, maxPaise: 25000 },
      inStock: true,
      variantCount: 3,
    })
    expect(summary!.swatches.map((s) => s.name)).toEqual(["Sage", "Indigo"])
  })

  it("carries the compare-at price of the cheapest variant for the card", () => {
    const { summary } = summarizeVariants(
      [variant({ pricePaise: 18000, salePricePaise: 15000 })],
      NOW
    )
    expect(summary!.priceRange).toEqual({
      minPaise: 15000,
      maxPaise: 15000,
      compareAtMinPaise: 18000,
    })
  })

  it("is out of stock only when every active variant is", () => {
    const empty = { onHand: 0, reserved: 0 }
    expect(summarizeVariants([variant({ stock: empty })], NOW).summary!.inStock).toBe(false)
    expect(
      summarizeVariants([variant({ stock: empty }), variant({ sku: "B" })], NOW).summary!.inStock
    ).toBe(true)
    // Stock below the minimum order cannot be sold, so it counts as out of stock.
    expect(
      summarizeVariants([variant({ stock: { onHand: 300, reserved: 0 } })], NOW).summary!.inStock
    ).toBe(false)
  })

  it("ignores inactive variants", () => {
    const { summary } = summarizeVariants(
      [variant({ sku: "A" }), variant({ sku: "B", status: "inactive", pricePaise: 100 })],
      NOW
    )
    expect(summary!.priceRange!.minPaise).toBe(18000)
    expect(summary!.variantCount).toBe(1)
  })
})

describe("assertConsistentUnits", () => {
  it("allows variants sold in the same kind of unit", () => {
    expect(() =>
      assertConsistentUnits([
        variant(),
        variant({ sku: "B", sellingUnit: units.perMetre({ stepMm: 100 }) }),
      ])
    ).not.toThrow()
  })

  it("rejects mixing units on one product", () => {
    expect(() =>
      assertConsistentUnits([variant(), variant({ sku: "B", sellingUnit: units.each("set") })])
    ).toThrow(ValidationError)
  })

  it("rejects mixing display units even within the same kind", () => {
    const cm = {
      ...units.perMetre(),
      displayUnit: "cm" as const,
      baseUnitsPerDisplayUnit: 10,
      pricePerBaseUnits: 10,
    }
    expect(() =>
      assertConsistentUnits([variant(), variant({ sku: "B", sellingUnit: cm })])
    ).toThrow(ValidationError)
  })
})
