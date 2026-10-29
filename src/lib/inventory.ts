import { formatQuantity, maxOrderableQty, type SellingUnit } from "@/lib/measure"

/** Stock is held per variant in the base unit. `available` is derived and never stored. */
export type Stock = { onHand: number; reserved: number }

export function availableQty(stock: Stock): number {
  // Invariant: 0 <= reserved <= onHand. A violation must not read as negative or inflated stock.
  return Math.max(0, stock.onHand - stock.reserved)
}

export type AvailabilityStatus = "in_stock" | "low_stock" | "out_of_stock"

export type Availability = {
  status: AvailabilityStatus
  /** Customer-facing text. Never exposes exact stock above the low-stock threshold. */
  label: string
  /** Largest quantity that can be added to a bag right now, in base units. */
  maxOrderable: number
}

export function availability(
  unit: SellingUnit,
  stock: Stock,
  lowStockThreshold: number
): Availability {
  const available = availableQty(stock)
  const maxOrderable = maxOrderableQty(unit, available)
  if (maxOrderable === 0) return { status: "out_of_stock", label: "Out of stock", maxOrderable: 0 }
  if (available <= lowStockThreshold) {
    return {
      status: "low_stock",
      label: `Only ${formatQuantity(unit, available)} left`,
      maxOrderable,
    }
  }
  return { status: "in_stock", label: "In stock", maxOrderable }
}
