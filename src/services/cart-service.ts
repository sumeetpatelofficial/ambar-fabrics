import "server-only"
import mongoose from "mongoose"
import type { BagLineInput, CartLineView, PricedCart } from "@/features/cart/types"
import { effectivePrice } from "@/features/catalog/pricing"
import { connectDb } from "@/lib/db/mongoose"
import { ValidationError } from "@/lib/errors"
import { availableQty } from "@/lib/inventory"
import {
  formatQuantity,
  lineSubtotalPaise,
  maxOrderableQty,
  priceUnitLabel,
  validateQuantity,
} from "@/lib/measure"
import { Cart, CART_MAX_LINES } from "@/models/cart"
import type { ProductDoc } from "@/models/product"
import type { ProductVariantDoc } from "@/models/product-variant"
import { productRepository } from "@/repositories/product-repository"
import { variantRepository } from "@/repositories/variant-repository"

/**
 * The bag. Stored lines hold a variant and a quantity and nothing else. Everything shown or charged
 * (price, availability, limits) is recomputed from the catalogue each time, so a stale or tampered bag
 * can never change what something costs. Adding does not hold stock; holding starts at checkout.
 */

const OBJECT_ID = /^[0-9a-f]{24}$/

export type Buyable = { variant: ProductVariantDoc; product: ProductDoc }

/** Variants that exist, are active, and belong to an active product. Others are simply absent. */
async function loadBuyable(variantIds: string[]): Promise<Map<string, Buyable>> {
  const ids = variantIds
    .filter((id) => OBJECT_ID.test(id))
    .map((id) => new mongoose.Types.ObjectId(id))
  if (ids.length === 0) return new Map()
  const variants = await variantRepository.findActiveByIds(ids)
  const products = await productRepository.findActiveByIds([
    ...new Set(variants.map((v) => v.productId)),
  ])
  const byProduct = new Map(products.map((p) => [String(p._id), p]))
  const out = new Map<string, Buyable>()
  for (const variant of variants) {
    const product = byProduct.get(String(variant.productId))
    if (product) out.set(String(variant._id), { variant, product })
  }
  return out
}

/** Prices a list of lines against the live catalogue (pricing engine v1: no tax or shipping yet). */
export async function priceLines(lines: BagLineInput[], now = new Date()): Promise<PricedCart> {
  return (await priceWithSource(lines, now)).cart
}

/** The priced bag together with the catalogue rows it was priced from, so checkout snapshots the same data it priced. */
export async function priceWithSource(
  lines: BagLineInput[],
  now = new Date()
): Promise<{ cart: PricedCart; source: Map<string, Buyable> }> {
  await connectDb()
  const buyable = await loadBuyable(lines.map((l) => l.variantId))
  const views: CartLineView[] = lines.map((line) => {
    const found = buyable.get(line.variantId)
    if (!found) return unavailableLine(line)
    const { variant, product } = found
    const unit = variant.sellingUnit
    const available = availableQty(variant.stock)
    const price = effectivePrice(variant, now)
    const check = validateQuantity(unit, line.qty, available)
    const base = {
      variantId: line.variantId,
      slug: product.slug,
      name: product.name,
      sku: variant.sku,
      colorName: variant.options?.colorName,
      colorHex: variant.options?.colorHex,
      size: variant.options?.size,
      image: product.images?.[0]
        ? { url: product.images[0].url, alt: product.images[0].alt }
        : undefined,
      unit,
      qty: line.qty,
      unitPricePaise: price.pricePaise,
      comparePaise: price.comparePaise,
      unitLabel: priceUnitLabel(unit),
      maxOrderable: maxOrderableQty(unit, available),
    }
    if (!check.ok) {
      return {
        ...base,
        linePaise: 0,
        status: "invalid" as const,
        message:
          check.code === "INSUFFICIENT_STOCK" && base.maxOrderable === 0
            ? "This item is out of stock."
            : check.message,
      }
    }
    return {
      ...base,
      linePaise: lineSubtotalPaise(price.pricePaise, line.qty, unit),
      status: "ok" as const,
    }
  })
  const ok = views.filter((v) => v.status === "ok")
  return {
    cart: {
      lines: views,
      subtotalPaise: ok.reduce((sum, v) => sum + v.linePaise, 0),
      itemCount: ok.length,
      canCheckout: views.length > 0 && ok.length === views.length,
    },
    source: buyable,
  }
}

function unavailableLine(line: BagLineInput): CartLineView {
  return {
    variantId: line.variantId,
    slug: "",
    name: "This item is no longer available",
    sku: "",
    unit: {
      kind: "piece",
      baseUnit: "each",
      displayUnit: "each",
      baseUnitsPerDisplayUnit: 1,
      pricePerBaseUnits: 1,
      minQty: 1,
      stepQty: 1,
    },
    qty: line.qty,
    unitPricePaise: 0,
    unitLabel: "",
    linePaise: 0,
    maxOrderable: 0,
    status: "unavailable",
    message: "It was removed from the shop. Remove it from your bag to continue.",
  }
}

// ------------------------------------------------------------------ the stored bag

const toInputs = (lines: { variantId: unknown; qty: number }[]): BagLineInput[] =>
  lines.map((l) => ({ variantId: String(l.variantId), qty: l.qty }))

export async function getCartLines(userId: string): Promise<BagLineInput[]> {
  await connectDb()
  const cart = await Cart.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean()
  return toInputs(cart?.lines ?? [])
}

type Lines = { variantId: mongoose.Types.ObjectId; qty: number; addedAt: Date }[]

/**
 * Applies a change to the stored lines with optimistic concurrency: if the bag changed between reading
 * and writing (two tabs, two quick taps), the change is recomputed on the new contents and tried again.
 */
async function mutate(
  userId: string,
  change: (lines: Lines) => Promise<Lines> | Lines,
  /** When set, the change is recorded under this id and is never applied a second time. */
  once?: string
): Promise<BagLineInput[]> {
  await connectDb()
  const uid = new mongoose.Types.ObjectId(userId)
  await Cart.updateOne(
    { userId: uid },
    { $setOnInsert: { userId: uid, lines: [] } },
    { upsert: true }
  ).catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error // lost the race to create it: fine
  })
  for (let attempt = 0; attempt < 12; attempt++) {
    // A short, uneven pause after a lost race, so changes made at the same moment do not collide again in step.
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 15 * attempt))
    const cart = await Cart.findOne({ userId: uid }).lean()
    if (!cart) continue
    if (once && cart.mergedIds?.includes(once)) return toInputs(cart.lines) // already applied
    const next = await change(cart.lines as unknown as Lines)
    const written = await Cart.updateOne(
      { _id: cart._id, updatedAt: cart.updatedAt },
      {
        $set: { lines: next },
        ...(once ? { $push: { mergedIds: { $each: [once], $slice: -20 } } } : {}),
      }
    )
    if (written.modifiedCount === 1 || written.matchedCount === 1) return toInputs(next)
  }
  throw new ValidationError("Your bag is being changed from another window. Please try again.")
}

function assertBuyable(found: Buyable | undefined, qty: number): asserts found is Buyable {
  if (!found) throw new ValidationError("That item is no longer available.")
  const { variant } = found
  const check = validateQuantity(variant.sellingUnit, qty, availableQty(variant.stock))
  if (!check.ok) {
    throw new ValidationError(
      check.code === "INSUFFICIENT_STOCK"
        ? `Only ${formatQuantity(variant.sellingUnit, availableQty(variant.stock))} is available${qty > variant.sellingUnit.minQty ? ", including what is already in your bag" : ""}.`
        : check.message
    )
  }
}

function idOrThrow(variantId: string) {
  if (!OBJECT_ID.test(variantId)) throw new ValidationError("That item is not valid.")
  return new mongoose.Types.ObjectId(variantId)
}

/** Adds to what is already in the bag. The combined quantity must be valid and in stock. */
export async function addToCart(userId: string, variantId: string, qty: number) {
  const vid = idOrThrow(variantId)
  const found = (await loadBuyable([variantId])).get(variantId)
  return mutate(userId, (lines) => {
    const existing = lines.find((l) => String(l.variantId) === variantId)
    if (!existing && lines.length >= CART_MAX_LINES)
      throw new ValidationError(`Your bag can hold ${CART_MAX_LINES} different items.`)
    const total = (existing?.qty ?? 0) + qty
    assertBuyable(found, total)
    return existing
      ? lines.map((l) => (l === existing ? { ...l, qty: total } : l))
      : [...lines, { variantId: vid, qty: total, addedAt: new Date() }]
  })
}

/** Sets a line to an exact quantity (the cart page's stepper). Zero removes it. */
export async function setCartQuantity(userId: string, variantId: string, qty: number) {
  idOrThrow(variantId)
  if (qty === 0) return removeFromCart(userId, variantId)
  const found = (await loadBuyable([variantId])).get(variantId)
  return mutate(userId, (lines) => {
    if (!lines.some((l) => String(l.variantId) === variantId))
      throw new ValidationError("That item is not in your bag.")
    assertBuyable(found, qty)
    return lines.map((l) => (String(l.variantId) === variantId ? { ...l, qty } : l))
  })
}

export async function removeFromCart(userId: string, variantId: string) {
  idOrThrow(variantId)
  return mutate(userId, (lines) => lines.filter((l) => String(l.variantId) !== variantId))
}

/** After an order is paid: takes just the purchased items out of the bag, leaving anything added since. */
export async function removePurchased(
  userId: string,
  purchased: { variantId: string; qty: number }[]
) {
  const bought = new Map(purchased.map((p) => [p.variantId, p.qty]))
  return mutate(userId, (lines) =>
    lines
      .filter((l) => {
        const qty = bought.get(String(l.variantId))
        return qty === undefined || l.qty > qty // a bag with more than was bought keeps the difference below
      })
      .map((l) => {
        const qty = bought.get(String(l.variantId))
        return qty === undefined ? l : { ...l, qty: l.qty - qty }
      })
  )
}

export async function clearCart(userId: string) {
  return mutate(userId, () => [])
}

/**
 * Folds a guest bag into the account's after sign-in. For the same item the quantities add up, then are
 * brought back within the item's rules (and stock) with a notice; items that can no longer be bought are
 * dropped with a notice.
 */
export async function mergeGuestBag(
  userId: string,
  guest: BagLineInput[],
  mergeId?: string
): Promise<{ lines: BagLineInput[]; notices: string[] }> {
  const notices: string[] = []
  const wanted = new Map<string, number>()
  for (const g of guest) {
    if (!OBJECT_ID.test(g.variantId) || !Number.isSafeInteger(g.qty) || g.qty <= 0) continue
    wanted.set(g.variantId, (wanted.get(g.variantId) ?? 0) + g.qty)
  }
  if (wanted.size === 0) return { lines: await getCartLines(userId), notices }
  const buyable = await loadBuyable([...wanted.keys()])
  const lines = await mutate(
    userId,
    (stored) => {
      notices.length = 0
      let next = [...stored]
      for (const [variantId, qty] of wanted) {
        const found = buyable.get(variantId)
        if (!found) {
          notices.push("An item in your bag is no longer available and was left out.")
          continue
        }
        const existing = next.find((l) => String(l.variantId) === variantId)
        const combined = (existing?.qty ?? 0) + qty
        const { sellingUnit: unit } = found.variant
        let final = combined
        if (!validateQuantity(unit, combined, availableQty(found.variant.stock)).ok) {
          final = maxOrderableQty(unit, availableQty(found.variant.stock))
          if (final === 0) {
            notices.push(`${found.product.name} is out of stock and was left out.`)
            continue
          }
          notices.push(
            `${found.product.name} was reduced to ${formatQuantity(unit, final)}, the most available.`
          )
        }
        if (!existing && next.length >= CART_MAX_LINES) {
          notices.push("Your bag is full, so some items were left out.")
          continue
        }
        next = existing
          ? next.map((l) => (l === existing ? { ...l, qty: final } : l))
          : [
              ...next,
              {
                variantId: new mongoose.Types.ObjectId(variantId),
                qty: final,
                addedAt: new Date(),
              },
            ]
      }
      return next
    },
    mergeId
  )
  return { lines, notices }
}
