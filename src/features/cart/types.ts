import type { SellingUnit } from "@/lib/measure"

/** One line of a bag as the customer sees it, with every number computed on the server. */
export type CartLineView = {
  variantId: string
  slug: string
  name: string
  sku: string
  colorName?: string
  colorHex?: string
  size?: string
  image?: { url: string; alt: string }
  unit: SellingUnit
  /** Quantity in the unit's base unit, as stored. */
  qty: number
  unitPricePaise: number
  comparePaise?: number
  unitLabel: string
  /** Rounded once for the line. Zero for a line that cannot be bought. */
  linePaise: number
  /** Largest quantity that could be bought right now, in base units (0 when nothing can). */
  maxOrderable: number
  /** `ok` lines count towards the total; the others are shown with a reason and left out of it. */
  status: "ok" | "invalid" | "unavailable"
  message?: string
}

export type PricedCart = {
  lines: CartLineView[]
  subtotalPaise: number
  /** Number of lines that count towards the total. */
  itemCount: number
  /** True when every line can be bought as it stands (and there is at least one). */
  canCheckout: boolean
}

export type BagLineInput = { variantId: string; qty: number }

export type CartResult =
  { ok: true; lines: BagLineInput[]; notices?: string[] } | { ok: false; message: string }
