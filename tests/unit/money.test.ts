import { describe, expect, it } from "vitest"
import { formatPaise, percentOff } from "@/lib/money"

describe("formatPaise", () => {
  it("drops .00 for whole rupees and uses Indian digit grouping", () => {
    expect(formatPaise(18000)).toBe("₹180")
    expect(formatPaise(129900)).toBe("₹1,299")
    expect(formatPaise(14990000)).toBe("₹1,49,900")
  })

  it("keeps paise when they matter", () => {
    expect(formatPaise(18050)).toBe("₹180.50")
    expect(formatPaise(1)).toBe("₹0.01")
  })

  it("rejects floats and negatives instead of formatting a wrong price", () => {
    expect(() => formatPaise(180.5)).toThrow(RangeError)
    expect(() => formatPaise(-1)).toThrow(RangeError)
    expect(() => formatPaise(Number.NaN)).toThrow(RangeError)
  })
})

describe("percentOff", () => {
  it("rounds down so a label never overstates the saving", () => {
    expect(percentOff(129900, 159900)).toBe(18) // 18.76%
    expect(percentOff(50, 100)).toBe(50)
  })

  it("is zero when there is no discount or the compare price is not higher", () => {
    expect(percentOff(100, 100)).toBe(0)
    expect(percentOff(200, 100)).toBe(0)
    expect(percentOff(0, 0)).toBe(0)
  })
})

import { allocate, mulDivRound, paiseToRupeeString, rupeesToPaise } from "@/lib/money"

describe("rupeesToPaise / paiseToRupeeString", () => {
  it("parses typed amounts exactly", () => {
    expect(rupeesToPaise("180")).toBe(18000)
    expect(rupeesToPaise("180.5")).toBe(18050)
    expect(rupeesToPaise("180.05")).toBe(18005)
    expect(rupeesToPaise(" 0.99 ")).toBe(99)
  })

  it.each(["", "-1", "1.234", "1,299", "₹180", "1e3", "abc", ".5", "1.", "0x10"])(
    "rejects %j",
    (input) => {
      expect(() => rupeesToPaise(input)).toThrow(RangeError)
    }
  )

  it("round-trips for every paise value in a sample range", () => {
    for (let paise = 0; paise < 20000; paise += 7) {
      expect(rupeesToPaise(paiseToRupeeString(paise))).toBe(paise)
    }
  })

  it("never goes through floating point (0.1 + 0.2 style traps)", () => {
    expect(rupeesToPaise("0.29")).toBe(29) // 0.29 * 100 === 28.999999999999996 in floats
    expect(rupeesToPaise("1.15")).toBe(115)
  })
})

describe("mulDivRound", () => {
  it("rounds halves up and exact results stay exact", () => {
    expect(mulDivRound(20000, 2500, 1000)).toBe(50000)
    expect(mulDivRound(3333, 150, 1000)).toBe(500) // 499.95
    expect(mulDivRound(1, 1, 2)).toBe(1) // 0.5 rounds up
    expect(mulDivRound(1, 1, 3)).toBe(0)
    expect(mulDivRound(0, 99999, 7)).toBe(0)
  })

  it("matches exact rational rounding on random inputs", () => {
    let seed = 12345
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % max
    }
    for (let i = 0; i < 5000; i++) {
      const a = rand(5_000_000)
      const b = rand(100_000)
      const d = 1 + rand(2000)
      const exact = (BigInt(2) * BigInt(a) * BigInt(b) + BigInt(d)) / (BigInt(2) * BigInt(d))
      expect(BigInt(mulDivRound(a, b, d))).toBe(exact)
    }
  })

  it("refuses inputs it cannot compute exactly", () => {
    expect(() => mulDivRound(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError)
    expect(() => mulDivRound(1.5, 2, 1)).toThrow(RangeError)
    expect(() => mulDivRound(-1, 2, 1)).toThrow(RangeError)
    expect(() => mulDivRound(1, 2, 0)).toThrow(RangeError)
  })
})

describe("allocate", () => {
  it("always adds up to exactly the total", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(10, [3, 3, 3])).toEqual([4, 3, 3])
    expect(allocate(0, [5, 5])).toEqual([0, 0])
    expect(allocate(7, [0, 10])).toEqual([0, 7])
  })

  it("sums to the total and stays within one paise of the proportional share", () => {
    let seed = 99
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % max
    }
    for (let i = 0; i < 2000; i++) {
      const weights = Array.from({ length: 1 + rand(8) }, () => rand(200_000))
      if (weights.every((w) => w === 0)) continue
      const total = rand(500_000)
      const parts = allocate(total, weights)
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      const sum = weights.reduce((a, b) => a + b, 0)
      parts.forEach((p, idx) => expect(Math.abs(p - (total * weights[idx]!) / sum)).toBeLessThan(1))
    }
  })

  it("rejects empty or all-zero weights", () => {
    expect(() => allocate(10, [])).toThrow(RangeError)
    expect(() => allocate(10, [0, 0])).toThrow(RangeError)
  })
})
