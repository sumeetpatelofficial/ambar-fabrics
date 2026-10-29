import { z } from "zod"
import { mulDivRound } from "@/lib/money"

/**
 * Selling units and quantities. Quantities are integers in a base unit (millimetres for fabric sold by
 * length, "each" for everything else). Display units are derived from the base unit here and nowhere
 * else. See docs/inventory-and-measurements.md.
 */

const posInt = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

const KIND_RULES = {
  length: { baseUnit: "mm", displayUnits: ["m", "cm"] },
  piece: { baseUnit: "each", displayUnits: ["each"] },
  set: { baseUnit: "each", displayUnits: ["set"] },
  pair: { baseUnit: "each", displayUnits: ["pair"] },
  pack: { baseUnit: "each", displayUnits: ["pack"] },
} as const

const BASE_PER_DISPLAY = { m: 1000, cm: 10, each: 1, set: 1, pair: 1, pack: 1 } as const

export const sellingUnitSchema = z
  .object({
    kind: z.enum(["length", "piece", "set", "pair", "pack"]),
    baseUnit: z.enum(["mm", "each"]),
    displayUnit: z.enum(["m", "cm", "each", "set", "pair", "pack"]),
    baseUnitsPerDisplayUnit: posInt,
    /** Price is quoted per this many base units. Always one display unit, so "per metre" is literal. */
    pricePerBaseUnits: posInt,
    minQty: posInt,
    stepQty: posInt,
    maxQtyPerOrder: posInt.optional(),
  })
  .superRefine((u, ctx) => {
    const rule = KIND_RULES[u.kind]
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message })
    if (u.baseUnit !== rule.baseUnit) issue("baseUnit", `${u.kind} must use ${rule.baseUnit}`)
    if (!(rule.displayUnits as readonly string[]).includes(u.displayUnit)) {
      issue("displayUnit", `${u.kind} cannot be shown in ${u.displayUnit}`)
    }
    if (u.baseUnitsPerDisplayUnit !== BASE_PER_DISPLAY[u.displayUnit]) {
      issue(
        "baseUnitsPerDisplayUnit",
        `${u.displayUnit} must equal ${BASE_PER_DISPLAY[u.displayUnit]} base units`
      )
    }
    if (u.pricePerBaseUnits !== u.baseUnitsPerDisplayUnit) {
      issue("pricePerBaseUnits", "price must be quoted per one display unit")
    }
    if (u.minQty % u.stepQty !== 0) issue("minQty", "minimum must be a multiple of the step")
    if (u.maxQtyPerOrder !== undefined) {
      if (u.maxQtyPerOrder < u.minQty)
        issue("maxQtyPerOrder", "maximum must not be below the minimum")
      if ((u.maxQtyPerOrder - u.minQty) % u.stepQty !== 0)
        issue("maxQtyPerOrder", "maximum must fall on a step")
    }
  })

export type SellingUnit = z.infer<typeof sellingUnitSchema>

/** Convenience constructors, so seed data and tests cannot drift from the documented examples. */
export const units = {
  /** Fabric by the metre, in `stepMm` increments (default half a metre). */
  perMetre(opts: { minMm?: number; stepMm?: number; maxMm?: number } = {}): SellingUnit {
    const stepMm = opts.stepMm ?? 500
    return {
      kind: "length",
      baseUnit: "mm",
      displayUnit: "m",
      baseUnitsPerDisplayUnit: 1000,
      pricePerBaseUnits: 1000,
      minQty: opts.minMm ?? stepMm,
      stepQty: stepMm,
      ...(opts.maxMm ? { maxQtyPerOrder: opts.maxMm } : {}),
    }
  },
  each(kind: "piece" | "set" | "pair" | "pack" = "piece", maxQtyPerOrder?: number): SellingUnit {
    return {
      kind,
      baseUnit: "each",
      displayUnit: kind === "piece" ? "each" : kind,
      baseUnitsPerDisplayUnit: 1,
      pricePerBaseUnits: 1,
      minQty: 1,
      stepQty: 1,
      ...(maxQtyPerOrder ? { maxQtyPerOrder } : {}),
    }
  },
}

// ---------------------------------------------------------------- pricing

/** Line subtotal in paise, rounded once, half up. Example: 20000 paise/m x 2500 mm = 50000 paise. */
export function lineSubtotalPaise(unitPricePaise: number, qty: number, unit: SellingUnit): number {
  return mulDivRound(unitPricePaise, qty, unit.pricePerBaseUnits)
}

// ---------------------------------------------------------------- validation

export type QuantityIssue =
  | "QUANTITY_INVALID"
  | "QUANTITY_BELOW_MIN"
  | "QUANTITY_BAD_STEP"
  | "QUANTITY_EXCEEDS_MAX"
  | "INSUFFICIENT_STOCK"

export type QuantityResult = { ok: true } | { ok: false; code: QuantityIssue; message: string }

export function validateQuantity(
  unit: SellingUnit,
  qty: number,
  available?: number
): QuantityResult {
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    return { ok: false, code: "QUANTITY_INVALID", message: "Enter a quantity greater than zero." }
  }
  if (qty < unit.minQty) {
    return {
      ok: false,
      code: "QUANTITY_BELOW_MIN",
      message: `The minimum is ${formatQuantity(unit, unit.minQty)}.`,
    }
  }
  if ((qty - unit.minQty) % unit.stepQty !== 0) {
    return {
      ok: false,
      code: "QUANTITY_BAD_STEP",
      message: `Choose a length in steps of ${formatQuantity(unit, unit.stepQty)}.`,
    }
  }
  if (unit.maxQtyPerOrder !== undefined && qty > unit.maxQtyPerOrder) {
    return {
      ok: false,
      code: "QUANTITY_EXCEEDS_MAX",
      message: `The most you can order is ${formatQuantity(unit, unit.maxQtyPerOrder)}.`,
    }
  }
  if (available !== undefined && qty > available) {
    return {
      ok: false,
      code: "INSUFFICIENT_STOCK",
      message: `Only ${formatQuantity(unit, Math.max(0, available))} is available.`,
    }
  }
  return { ok: true }
}

/** The largest valid order quantity right now (0 when nothing can be ordered). */
export function maxOrderableQty(unit: SellingUnit, available: number): number {
  const cap = Math.min(available, unit.maxQtyPerOrder ?? Number.MAX_SAFE_INTEGER)
  if (!Number.isSafeInteger(cap) || cap < unit.minQty) return 0
  return unit.minQty + Math.floor((cap - unit.minQty) / unit.stepQty) * unit.stepQty
}

// ---------------------------------------------------------------- display

const DECIMALS = { 1: 0, 10: 1, 1000: 3 } as const

/** Base units to a decimal string in the display unit, without float arithmetic: 2500 mm -> "2.5". */
export function baseToDisplayString(unit: SellingUnit, qty: number): string {
  const decimals = DECIMALS[unit.baseUnitsPerDisplayUnit as keyof typeof DECIMALS] ?? 0
  const whole = Math.floor(qty / unit.baseUnitsPerDisplayUnit)
  if (decimals === 0) return String(whole)
  const frac = String(qty % unit.baseUnitsPerDisplayUnit)
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return frac ? `${whole}.${frac}` : String(whole)
}

const NOUNS = {
  each: ["piece", "pieces"],
  set: ["set", "sets"],
  pair: ["pair", "pairs"],
  pack: ["pack", "packs"],
} as const

/** "2.5 m", "25 cm", "1 set", "3 pairs". */
export function formatQuantity(unit: SellingUnit, qty: number): string {
  const text = baseToDisplayString(unit, qty)
  if (unit.displayUnit === "m" || unit.displayUnit === "cm") return `${text} ${unit.displayUnit}`
  const [singular, plural] = NOUNS[unit.displayUnit]
  return `${text} ${qty === 1 ? singular : plural}`
}

/** "per metre", "per set", "each": always shown beside a price so the number cannot be misread. */
export function priceUnitLabel(unit: SellingUnit): string {
  switch (unit.displayUnit) {
    case "m":
      return "per metre"
    case "cm":
      return "per cm"
    case "each":
      return "each"
    default:
      return `per ${unit.displayUnit}`
  }
}

export type ParsedQuantity = { ok: true; qty: number } | { ok: false; message: string }

/** Parses what a person typed ("2.5") into base units. Rejects extra precision rather than rounding. */
export function parseDisplayQuantity(unit: SellingUnit, text: string): ParsedQuantity {
  const decimals = DECIMALS[unit.baseUnitsPerDisplayUnit as keyof typeof DECIMALS] ?? 0
  const pattern = decimals === 0 ? /^\d{1,9}$/ : new RegExp(`^\\d{1,9}(\\.\\d{1,${decimals}})?$`)
  const trimmed = text.trim()
  if (!pattern.test(trimmed)) {
    return {
      ok: false,
      message:
        decimals === 0
          ? "Enter a whole number."
          : `Enter a number with at most ${decimals} decimal places.`,
    }
  }
  const [whole = "0", frac = ""] = trimmed.split(".")
  return {
    ok: true,
    qty: Number(whole) * unit.baseUnitsPerDisplayUnit + Number(frac.padEnd(decimals, "0") || 0),
  }
}
