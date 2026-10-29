/**
 * Money is integer paise everywhere (1 rupee = 100 paise). No floats in storage or arithmetic.
 * See docs/inventory-and-measurements.md for the pricing formulas this implements.
 */
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})
const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
})

export function assertPaise(value: number, label = "paise"): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

export function formatPaise(paise: number): string {
  assertPaise(paise)
  // Whole rupees read cleaner without ".00"; keep decimals when they matter.
  return paise % 100 === 0 ? inrWhole.format(paise / 100) : inr.format(paise / 100)
}

/** Whole-number percentage off, rounded down so a label never overstates the saving. */
export function percentOff(pricePaise: number, comparePaise: number): number {
  if (comparePaise <= pricePaise || comparePaise <= 0) return 0
  return Math.floor(((comparePaise - pricePaise) * 100) / comparePaise)
}

/** Parses a rupee amount typed by a person ("180", "180.5", "180.50") into paise. Rejects anything else. */
export function rupeesToPaise(input: string): number {
  const text = input.trim()
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) {
    throw new RangeError("amount must be a number with at most two decimal places")
  }
  const [whole = "0", frac = ""] = text.split(".")
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"))
}

/** "180.50" for 18050. For inputs and exports, not for display (use formatPaise). */
export function paiseToRupeeString(paise: number): string {
  assertPaise(paise)
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`
}

/**
 * round(a * b / d) with halves rounded up, using integer arithmetic only.
 * All arguments are non-negative integers and d > 0. Throws instead of silently losing precision.
 */
export function mulDivRound(a: number, b: number, d: number): number {
  if (![a, b, d].every(Number.isSafeInteger) || a < 0 || b < 0 || d <= 0) {
    throw new RangeError("mulDivRound requires non-negative safe integers and a positive divisor")
  }
  const numerator = 2 * a * b + d
  if (!Number.isSafeInteger(numerator)) throw new RangeError("amount too large to compute exactly")
  return Math.floor(numerator / (2 * d))
}

/**
 * Splits `total` across `weights` so the parts add up to exactly `total` (largest-remainder method,
 * ties to the earlier index). Used to spread an order-level discount across lines.
 */
export function allocate(total: number, weights: number[]): number[] {
  assertPaise(total, "total")
  if (weights.length === 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError("weights must be a non-empty list of non-negative integers")
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) throw new RangeError("weights must not all be zero")

  const parts = weights.map((w, index) => {
    const product = total * w
    if (!Number.isSafeInteger(product)) throw new RangeError("amount too large to allocate exactly")
    return { index, share: Math.floor(product / sum), remainder: product % sum }
  })
  let left = total - parts.reduce((a, p) => a + p.share, 0)
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const part of byRemainder) {
    if (left === 0) break
    part.share += 1
    left -= 1
  }
  return parts.map((p) => p.share)
}
