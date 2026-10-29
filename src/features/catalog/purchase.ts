import { maxOrderableQty, type SellingUnit } from "@/lib/measure"
import type { SwatchDTO, VariantDTO } from "@/features/catalog/types"

/**
 * Pure logic behind the product page's purchase panel: which options exist, which variant they select,
 * and how quantities step. Kept free of React so it is easy to test.
 */
export type VariantOptions = { colors: SwatchDTO[]; sizes: string[] }

export function variantOptions(variants: VariantDTO[]): VariantOptions {
  const colors: SwatchDTO[] = []
  const sizes: string[] = []
  for (const v of variants) {
    if (v.colorName && v.colorHex && !colors.some((c) => c.name === v.colorName)) {
      colors.push({ name: v.colorName, hex: v.colorHex })
    }
    if (v.size && !sizes.includes(v.size)) sizes.push(v.size)
  }
  return { colors, sizes }
}

export type Selection = { color?: string; size?: string }

/** The variant for a choice of colour and size. A dimension that does not vary is ignored. */
export function resolveVariant(
  variants: VariantDTO[],
  { color, size }: Selection
): VariantDTO | undefined {
  return variants.find(
    (v) => (color === undefined || v.colorName === color) && (size === undefined || v.size === size)
  )
}

/** Start on the first variant that can actually be bought, so the page opens on something useful. */
export function initialSelection(variants: VariantDTO[]): Selection {
  const pick = variants.find((v) => v.availability.status !== "out_of_stock") ?? variants[0]
  return { color: pick?.colorName, size: pick?.size }
}

/** Largest quantity still orderable after what is already in the bag, on the step grid. */
export function remainingOrderable(unit: SellingUnit, maxOrderable: number, inBag: number): number {
  return maxOrderableQty(unit, Math.max(0, maxOrderable - inBag))
}

/** One step up or down, kept within [minQty, max]. */
export function stepQuantity(
  unit: SellingUnit,
  qty: number,
  direction: 1 | -1,
  max: number
): number {
  const next = qty + direction * unit.stepQty
  if (next < unit.minQty) return unit.minQty
  if (max >= unit.minQty && next > max) return max
  return next
}

const QUICK_PICKS_MM = [1000, 2000, 2500, 3000, 5000]

/** Common lengths to tap instead of typing. Only for fabric sold by length, only valid and in stock. */
export function quickPicks(unit: SellingUnit, max: number): number[] {
  if (unit.kind !== "length") return []
  const picks = new Set<number>([unit.minQty, ...QUICK_PICKS_MM])
  return [...picks]
    .filter((q) => q >= unit.minQty && q <= max && (q - unit.minQty) % unit.stepQty === 0)
    .sort((a, b) => a - b)
    .slice(0, 6)
}

/** The ruler shows at least 5 m, growing in whole metres so the selected length always fits. */
export function scaleMaxMm(qtyMm: number): number {
  return Math.max(5000, Math.ceil(qtyMm / 1000) * 1000)
}
