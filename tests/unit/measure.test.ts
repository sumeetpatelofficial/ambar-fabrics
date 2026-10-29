import { describe, expect, it } from "vitest"
import {
  baseToDisplayString,
  formatQuantity,
  lineSubtotalPaise,
  maxOrderableQty,
  parseDisplayQuantity,
  priceUnitLabel,
  sellingUnitSchema,
  units,
  validateQuantity,
} from "@/lib/measure"

const metre = units.perMetre() // min 0.5 m, step 0.5 m
const lace = units.perMetre({ minMm: 1000, stepMm: 100 }) // min 1 m, step 10 cm
const suit = units.each("set", 5)

describe("sellingUnitSchema", () => {
  it("accepts the documented unit shapes", () => {
    for (const u of [
      metre,
      lace,
      suit,
      units.each("pair"),
      units.each("piece"),
      units.each("pack"),
    ]) {
      expect(sellingUnitSchema.safeParse(u).success).toBe(true)
    }
  })

  it("rejects inconsistent units", () => {
    const bad = [
      { ...metre, baseUnit: "each" }, // length must be mm
      { ...suit, displayUnit: "m" }, // a set cannot be shown in metres
      { ...metre, baseUnitsPerDisplayUnit: 100 }, // a metre is 1000 mm
      { ...metre, pricePerBaseUnits: 500 }, // price must be per one display unit
      { ...metre, minQty: 750 }, // not a multiple of the 500 step
      { ...metre, maxQtyPerOrder: 250 }, // below the minimum
      { ...metre, maxQtyPerOrder: 5250 }, // off the step grid
      { ...metre, stepQty: 0 },
      { ...metre, minQty: 1.5 },
      { ...metre, minQty: -500 },
    ]
    for (const u of bad)
      expect(sellingUnitSchema.safeParse(u).success, JSON.stringify(u)).toBe(false)
  })
})

describe("lineSubtotalPaise", () => {
  it("prices the brief's example exactly: Rs 200/m x 2.5 m = Rs 500", () => {
    expect(lineSubtotalPaise(20000, 2500, metre)).toBe(50000)
  })

  it("prices every documented sample product", () => {
    expect(lineSubtotalPaise(18000, 2500, metre)).toBe(45000) // cotton Rs 180/m, 2.5 m
    expect(lineSubtotalPaise(25000, 1000, metre)).toBe(25000) // printed Rs 250/m, 1 m
    expect(lineSubtotalPaise(3500, 1100, lace)).toBe(3850) // lace Rs 35/m, 1.1 m
    expect(lineSubtotalPaise(149900, 2, suit)).toBe(299800) // suit Rs 1,499/set x 2
    expect(lineSubtotalPaise(8000, 3, units.each("pair"))).toBe(24000) // latkan Rs 80/pair x 3
  })

  it("rounds once per line, half up", () => {
    expect(lineSubtotalPaise(3333, 1500, metre)).toBe(5000) // 4999.5 rounds up
    expect(lineSubtotalPaise(3333, 500, metre)).toBe(1667) // 1666.5 -> 1667
  })

  it("is linear: two half-metres cost the same as one metre when the price divides evenly", () => {
    expect(2 * lineSubtotalPaise(18000, 500, metre)).toBe(lineSubtotalPaise(18000, 1000, metre))
  })
})

describe("validateQuantity", () => {
  it("accepts quantities on the step grid", () => {
    for (const qty of [500, 1000, 2500, 10000]) expect(validateQuantity(metre, qty).ok).toBe(true)
    expect(validateQuantity(lace, 1100).ok).toBe(true)
    expect(validateQuantity(suit, 5).ok).toBe(true)
  })

  it.each([
    [0, "QUANTITY_INVALID"],
    [-500, "QUANTITY_INVALID"],
    [1.5, "QUANTITY_INVALID"],
    [Number.NaN, "QUANTITY_INVALID"],
    [Number.POSITIVE_INFINITY, "QUANTITY_INVALID"],
    [250, "QUANTITY_BELOW_MIN"],
    [1250, "QUANTITY_BAD_STEP"],
  ])("metre unit rejects %s with %s", (qty, code) => {
    const result = validateQuantity(metre, qty)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(code)
  })

  it("counts steps from the minimum, not from zero", () => {
    expect(validateQuantity(lace, 1050).ok).toBe(false) // 1 m min, 10 cm step: 1.05 m is off-grid
    expect(validateQuantity(lace, 1100).ok).toBe(true)
  })

  it("enforces the per-order maximum and stock", () => {
    const capped = validateQuantity(suit, 6)
    expect(!capped.ok && capped.code).toBe("QUANTITY_EXCEEDS_MAX")
    const short = validateQuantity(metre, 3000, 2500)
    expect(!short.ok && short.code).toBe("INSUFFICIENT_STOCK")
    if (!short.ok) expect(short.message).toBe("Only 2.5 m is available.")
    expect(validateQuantity(metre, 2500, 2500).ok).toBe(true)
  })
})

describe("maxOrderableQty", () => {
  it("rounds stock down to the step grid and respects the cap", () => {
    expect(maxOrderableQty(metre, 2750)).toBe(2500)
    expect(maxOrderableQty(metre, 400)).toBe(0) // below the minimum
    expect(maxOrderableQty(suit, 99)).toBe(5) // per-order cap
    expect(maxOrderableQty(lace, 1950)).toBe(1900)
    expect(maxOrderableQty(metre, 0)).toBe(0)
  })

  it("only ever returns quantities that validate", () => {
    for (const unit of [metre, lace, suit]) {
      for (let available = 0; available < 12_000; available += 37) {
        const q = maxOrderableQty(unit, available)
        if (q > 0)
          expect(validateQuantity(unit, q, available).ok, `${unit.kind} ${available}`).toBe(true)
      }
    }
  })
})

describe("display", () => {
  it("formats base units without floats", () => {
    expect(baseToDisplayString(metre, 2500)).toBe("2.5")
    expect(baseToDisplayString(metre, 1250)).toBe("1.25")
    expect(baseToDisplayString(metre, 1001)).toBe("1.001")
    expect(baseToDisplayString(metre, 3000)).toBe("3")
    expect(baseToDisplayString(metre, 50)).toBe("0.05")
    expect(baseToDisplayString(suit, 3)).toBe("3")
  })

  it("adds units and pluralises", () => {
    expect(formatQuantity(metre, 2500)).toBe("2.5 m")
    expect(formatQuantity(suit, 1)).toBe("1 set")
    expect(formatQuantity(suit, 3)).toBe("3 sets")
    expect(formatQuantity(units.each("pair"), 2)).toBe("2 pairs")
    expect(formatQuantity(units.each("piece"), 1)).toBe("1 piece")
  })

  it("labels prices with their unit", () => {
    expect(priceUnitLabel(metre)).toBe("per metre")
    expect(priceUnitLabel(suit)).toBe("per set")
    expect(priceUnitLabel(units.each("piece"))).toBe("each")
    expect(priceUnitLabel(units.each("pair"))).toBe("per pair")
  })

  it("parses typed quantities exactly and refuses extra precision", () => {
    expect(parseDisplayQuantity(metre, "2.5")).toEqual({ ok: true, qty: 2500 })
    expect(parseDisplayQuantity(metre, "0.05")).toEqual({ ok: true, qty: 50 })
    expect(parseDisplayQuantity(metre, "3")).toEqual({ ok: true, qty: 3000 })
    expect(parseDisplayQuantity(metre, "1.001")).toEqual({ ok: true, qty: 1001 })
    expect(parseDisplayQuantity(suit, "4")).toEqual({ ok: true, qty: 4 })
    for (const bad of ["", "1.0001", "-1", "abc", "1,5", "1e3", " "]) {
      expect(parseDisplayQuantity(metre, bad).ok, bad).toBe(false)
    }
    expect(parseDisplayQuantity(suit, "1.5").ok).toBe(false) // whole units only
  })

  it("round-trips base -> display -> base for every millimetre in a range", () => {
    for (let mm = 1; mm <= 20_000; mm += 3) {
      const parsed = parseDisplayQuantity(metre, baseToDisplayString(metre, mm))
      expect(parsed).toEqual({ ok: true, qty: mm })
    }
  })
})
