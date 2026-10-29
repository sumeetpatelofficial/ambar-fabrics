import type { SellingUnit } from "@/lib/measure"
import type { Parcel } from "@/lib/shipping/types"

/**
 * Package estimates. Until each product has a real weight, fabric is assumed to weigh 250 g per metre and
 * a finished piece 300 g (an assumption, shown in the project status). A variant's own weight wins.
 */
export const DEFAULT_GRAMS_PER_METRE = 250
export const DEFAULT_GRAMS_PER_PIECE = 300

/** Grams for one line. `perUnitGrams` is per metre for fabric by length and per piece otherwise. */
export function lineWeightGrams(unit: SellingUnit, qty: number, perUnitGrams?: number): number {
  if (unit.kind === "length") {
    return Math.max(1, Math.round(((perUnitGrams ?? DEFAULT_GRAMS_PER_METRE) * qty) / 1000))
  }
  return Math.max(1, (perUnitGrams ?? DEFAULT_GRAMS_PER_PIECE) * qty)
}

/** A folded-fabric parcel: fixed footprint, height grows with weight (about 2 cm per 500 g). */
export function parcelFor(totalGrams: number): Parcel {
  const weightGrams = Math.max(100, totalGrams)
  const heightMm = Math.min(300, Math.max(20, Math.ceil(weightGrams / 500) * 20))
  return { weightGrams, lengthMm: 300, widthMm: 250, heightMm }
}
