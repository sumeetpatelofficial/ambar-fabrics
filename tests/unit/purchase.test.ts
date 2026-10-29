import { describe, expect, it } from "vitest"
import {
  initialSelection,
  quickPicks,
  remainingOrderable,
  resolveVariant,
  scaleMaxMm,
  stepQuantity,
  variantOptions,
} from "@/features/catalog/purchase"
import type { VariantDTO } from "@/features/catalog/types"
import { units } from "@/lib/measure"

const metre = units.perMetre() // 0.5 m min and step
const lace = units.perMetre({ minMm: 1000, stepMm: 100 })
const suit = units.each("set", 5)

function v(over: Partial<VariantDTO> & { id: string }): VariantDTO {
  return {
    sku: over.id.toUpperCase(),
    label: over.id,
    unit: metre,
    unitLabel: "per metre",
    pricePaise: 18000,
    availability: { status: "in_stock", label: "In stock", maxOrderable: 40_000 },
    ...over,
  }
}

const colours: VariantDTO[] = [
  v({ id: "sage", colorName: "Sage", colorHex: "#8a9a7b" }),
  v({ id: "sand", colorName: "Sand", colorHex: "#d9cdb4" }),
]
const sizes: VariantDTO[] = ["S", "M", "L"].map((size) =>
  v({ id: size, colorName: "Teal", colorHex: "#3f5a52", size, unit: units.each("piece") })
)
const grid: VariantDTO[] = ["Teal", "Plum"].flatMap((c) =>
  ["S", "M"].map((s) => v({ id: `${c}${s}`, colorName: c, colorHex: "#111111", size: s }))
)

describe("variantOptions", () => {
  it("lists distinct colours and sizes in order", () => {
    expect(variantOptions(colours)).toEqual({
      colors: [
        { name: "Sage", hex: "#8a9a7b" },
        { name: "Sand", hex: "#d9cdb4" },
      ],
      sizes: [],
    })
    expect(variantOptions(sizes).sizes).toEqual(["S", "M", "L"])
    expect(variantOptions(sizes).colors).toHaveLength(1)
    expect(variantOptions(grid).colors.map((c) => c.name)).toEqual(["Teal", "Plum"])
  })
})

describe("resolveVariant", () => {
  it("finds a variant by colour, by size, or by both", () => {
    expect(resolveVariant(colours, { color: "Sand" })?.id).toBe("sand")
    expect(resolveVariant(sizes, { size: "M" })?.id).toBe("M")
    expect(resolveVariant(grid, { color: "Plum", size: "S" })?.id).toBe("PlumS")
  })

  it("returns undefined for a combination that does not exist", () => {
    expect(resolveVariant(colours, { color: "Nope" })).toBeUndefined()
    expect(resolveVariant(grid, { color: "Teal", size: "XL" })).toBeUndefined()
  })
})

describe("initialSelection", () => {
  it("skips sold-out variants when something else can be bought", () => {
    const soldOut = { status: "out_of_stock", label: "Out of stock", maxOrderable: 0 } as const
    const list = [{ ...colours[0]!, availability: soldOut }, colours[1]!]
    expect(initialSelection(list)).toEqual({ color: "Sand", size: undefined })
  })

  it("falls back to the first variant when everything is sold out", () => {
    const soldOut = { status: "out_of_stock", label: "Out of stock", maxOrderable: 0 } as const
    expect(initialSelection(colours.map((c) => ({ ...c, availability: soldOut }))).color).toBe(
      "Sage"
    )
  })
})

describe("stepQuantity", () => {
  it("moves by the step and clamps to the minimum and the maximum", () => {
    expect(stepQuantity(metre, 500, 1, 10_000)).toBe(1000)
    expect(stepQuantity(metre, 500, -1, 10_000)).toBe(500) // cannot go below the minimum
    expect(stepQuantity(metre, 10_000, 1, 10_000)).toBe(10_000) // cannot exceed what is available
    expect(stepQuantity(lace, 1000, 1, 5000)).toBe(1100)
    expect(stepQuantity(suit, 4, 1, 5)).toBe(5)
    expect(stepQuantity(suit, 5, 1, 5)).toBe(5)
  })
})

describe("remainingOrderable", () => {
  it("subtracts what is already in the bag and keeps to the step grid", () => {
    expect(remainingOrderable(metre, 10_000, 2_500)).toBe(7_500)
    expect(remainingOrderable(metre, 10_000, 9_800)).toBe(0) // 200 mm left is below the 500 mm minimum
    expect(remainingOrderable(suit, 5, 5)).toBe(0)
    expect(remainingOrderable(metre, 10_000, 99_999)).toBe(0)
  })
})

describe("quickPicks", () => {
  it("offers valid common lengths up to the available maximum", () => {
    expect(quickPicks(metre, 4_000)).toEqual([500, 1000, 2000, 2500, 3000])
    expect(quickPicks(metre, 40_000)).toEqual([500, 1000, 2000, 2500, 3000, 5000])
  })

  it("respects a unit's own minimum and step", () => {
    expect(quickPicks(lace, 6_000)).toEqual([1000, 2000, 2500, 3000, 5000])
    const wide = units.perMetre({ minMm: 1000, stepMm: 1000 })
    expect(quickPicks(wide, 6_000)).toEqual([1000, 2000, 3000, 5000]) // 2.5 m is off its grid
  })

  it("offers nothing for items that are not sold by length", () => {
    expect(quickPicks(suit, 5)).toEqual([])
  })
})

describe("scaleMaxMm", () => {
  it("is 5 m, or the next whole metre when the length is longer", () => {
    expect(scaleMaxMm(500)).toBe(5000)
    expect(scaleMaxMm(5000)).toBe(5000)
    expect(scaleMaxMm(5500)).toBe(6000)
  })
})
