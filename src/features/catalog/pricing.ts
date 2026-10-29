import { availability } from "@/lib/inventory"
import { priceUnitLabel } from "@/lib/measure"
import type { ProductVariantDoc } from "@/models/product-variant"
import { ValidationError } from "@/lib/errors"
import type { ProductDoc } from "@/models/product"

export type EffectivePrice = { pricePaise: number; comparePaise?: number }

/** The price a customer pays now, and the struck-through price to show beside it (if any). */
export function effectivePrice(
  v: Pick<
    ProductVariantDoc,
    "pricePaise" | "compareAtPaise" | "salePricePaise" | "saleStartsAt" | "saleEndsAt"
  >,
  now: Date
): EffectivePrice {
  const onSale =
    v.salePricePaise !== undefined &&
    v.salePricePaise !== null &&
    (!v.saleStartsAt || v.saleStartsAt <= now) &&
    (!v.saleEndsAt || v.saleEndsAt >= now)

  const pricePaise = onSale ? (v.salePricePaise as number) : v.pricePaise
  const reference = onSale ? (v.compareAtPaise ?? v.pricePaise) : v.compareAtPaise
  return reference !== undefined && reference !== null && reference > pricePaise
    ? { pricePaise, comparePaise: reference }
    : { pricePaise }
}

export type ProductSummary = Pick<
  ProductDoc,
  "unitKind" | "priceUnitLabel" | "priceRange" | "inStock" | "swatches" | "variantCount"
>

/**
 * Everything a listing card needs from a product's variants, computed once and stored on the product.
 * Sale windows are evaluated at `now`, so a nightly refresh is needed for sales that start or end
 * between edits (scheduled in Phase 12).
 */
export function summarizeVariants(
  variants: ProductVariantDoc[],
  now: Date
): { summary: ProductSummary } | { summary: null } {
  const active = variants.filter((v) => v.status === "active")
  if (active.length === 0) {
    return { summary: null }
  }
  assertConsistentUnits(active)

  const priced = active.map((v) => ({ v, price: effectivePrice(v, now) }))
  const min = priced.reduce((a, b) => (b.price.pricePaise < a.price.pricePaise ? b : a))
  const max = priced.reduce((a, b) => (b.price.pricePaise > a.price.pricePaise ? b : a))

  const seen = new Set<string>()
  const swatches = active.flatMap((v) => {
    const name = v.options?.colorName
    const hex = v.options?.colorHex
    if (!name || !hex || seen.has(name)) return []
    seen.add(name)
    return [{ name, hex }]
  })

  return {
    summary: {
      unitKind: min.v.sellingUnit.kind,
      priceUnitLabel: priceUnitLabel(min.v.sellingUnit),
      priceRange: {
        minPaise: min.price.pricePaise,
        maxPaise: max.price.pricePaise,
        ...(min.price.comparePaise ? { compareAtMinPaise: min.price.comparePaise } : {}),
      },
      inStock: active.some(
        (v) => availability(v.sellingUnit, v.stock, v.lowStockThreshold).status !== "out_of_stock"
      ),
      swatches,
      variantCount: active.length,
    },
  }
}

/** One product sells in one kind of unit, so "from Rs 180 per metre" is never ambiguous. */
export function assertConsistentUnits(
  variants: Pick<ProductVariantDoc, "sellingUnit" | "sku">[]
): void {
  const first = variants[0]?.sellingUnit
  if (!first) return
  const mismatch = variants.find(
    (v) => v.sellingUnit.kind !== first.kind || v.sellingUnit.displayUnit !== first.displayUnit
  )
  if (mismatch) {
    throw new ValidationError("All variants of a product must be sold in the same kind of unit.", [
      {
        path: `variants.${mismatch.sku}`,
        issue: `uses ${mismatch.sellingUnit.displayUnit}, expected ${first.displayUnit}`,
      },
    ])
  }
}
