import "server-only"
import mongoose from "mongoose"
import type { BagLineInput } from "@/features/cart/types"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { availableQty } from "@/lib/inventory"
import { logger } from "@/lib/logger"
import {
  formatQuantity,
  lineSubtotalPaise,
  maxOrderableQty,
  priceUnitLabel,
  type SellingUnit,
} from "@/lib/measure"
import { normalizeIndianMobile, toE164 } from "@/lib/phone"
import { computeTotals, type CouponRule } from "@/lib/pricing/totals"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { effectivePrice } from "@/features/catalog/pricing"
import { WALK_IN_EMAIL } from "@/lib/walk-in"
import { Order, type OrderDoc, type OrderItem } from "@/models/order"
import { Payment } from "@/models/payment"
import { Product, type ProductDoc } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { User } from "@/models/user"
import { lineWeightGrams } from "@/lib/shipping/parcel"
import { recordAudit } from "@/services/audit-service"
import { priceWithSource } from "@/services/cart-service"
import {
  adjustStock,
  commitReservation,
  InsufficientStockError,
  releaseReservation,
  reserveStock,
} from "@/services/inventory-service"
import { ensureInvoice } from "@/services/invoice-service"
import { getCommerceSettings, nextOrderNumber, transitionOrder } from "@/services/order-service"

const trusted = mongoose.trusted
const oid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id))

/**
 * Sales made over the counter. The sale is created already paid and handed over: stock leaves the shelf
 * straight away, a numbered bill exists, and nothing is shipped or emailed. The customer is always the
 * hidden walk-in account; a name and phone may be written on the bill.
 */

export const PAYMENT_METHODS = ["cash", "upi", "card"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type ShopDiscount = { kind: "amount" | "percent"; value: number; reason: string }
export type ShopCustomer = { name?: string; phone?: string }

const IDEMPOTENCY = /^[A-Za-z0-9_-]{16,100}$/
/** Below this a total is not worth recording as a sale (and a zero bill is almost surely a mistake). */
const MIN_TOTAL_PAISE = 100

/** The one account that owns every sale made in the shop; made the first time it is needed. */
export async function getWalkInUser(): Promise<{ _id: mongoose.Types.ObjectId }> {
  await connectDb()
  const user = await User.findOneAndUpdate(
    { email: WALK_IN_EMAIL },
    {
      $setOnInsert: {
        email: WALK_IN_EMAIL,
        name: "Walk-in customer",
        role: "customer",
        // Suspended on purpose: it can never sign in, and nobody can register the address to claim it.
        status: "suspended",
      },
    },
    { upsert: true, returnDocument: "after" }
  ).lean<{ _id: mongoose.Types.ObjectId }>()
  return user!
}

// ------------------------------------------------------------------ search

export type SellableRow = {
  variantId: string
  productName: string
  slug: string
  sku: string
  option: string
  unit: SellingUnit
  unitLabel: string
  pricePaise: number
  /** Largest quantity that can be sold right now, in base units; 0 when sold out. */
  maxOrderable: number
  stockText: string
  imageUrl?: string
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export async function searchSellable(actor: Actor, query: string): Promise<SellableRow[]> {
  assertPermission(actor, "orders:create_offline")
  const q = query.trim().slice(0, 60)
  if (q.length < 2) return []
  await connectDb()
  const pattern = new RegExp(escapeRegex(q), "i")
  const bySku = await ProductVariant.find({ sku: trusted({ $regex: pattern }), status: "active" })
    .limit(30)
    .lean<ProductVariantDoc[]>()
  const byName = await Product.find({ name: trusted({ $regex: pattern }), status: "active" })
    .limit(12)
    .lean<ProductDoc[]>()
  const productIds = [
    ...new Set([...byName.map((p) => String(p._id)), ...bySku.map((v) => String(v.productId))]),
  ].slice(0, 12)
  if (productIds.length === 0) return []
  const products = await Product.find({
    _id: trusted({ $in: productIds.map(oid) }),
    status: "active",
  }).lean<ProductDoc[]>()
  const variants = await ProductVariant.find({
    productId: trusted({ $in: products.map((p) => p._id) }),
    status: "active",
  })
    .sort({ sortOrder: 1, sku: 1 })
    .lean<ProductVariantDoc[]>()
  const nameOf = new Map(products.map((p) => [String(p._id), p]))
  const now = new Date()
  return variants.slice(0, 12).map((v) => {
    const product = nameOf.get(String(v.productId))!
    const available = availableQty(v.stock)
    const maxOrderable = maxOrderableQty(v.sellingUnit, available)
    return {
      variantId: String(v._id),
      productName: product.name,
      slug: product.slug,
      sku: v.sku,
      option: [v.options?.colorName, v.options?.size].filter(Boolean).join(", "),
      unit: v.sellingUnit,
      unitLabel: priceUnitLabel(v.sellingUnit),
      pricePaise: effectivePrice(v, now).pricePaise,
      maxOrderable,
      stockText:
        maxOrderable === 0 ? "Sold out" : `${formatQuantity(v.sellingUnit, available)} in stock`,
      imageUrl: v.imageUrl ?? product.images?.[0]?.url,
    }
  })
}

// ------------------------------------------------------------------ pricing

export type OfflineLineInput = { variantId: string; qty: number }

function mergeLines(lines: OfflineLineInput[]): BagLineInput[] {
  if (lines.length === 0) throw new ValidationError("Add at least one item.")
  const merged = new Map<string, number>()
  for (const l of lines) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.qty)
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }))
}

function discountRule(
  discount: ShopDiscount | undefined,
  subtotalPaise: number
): { rule?: CouponRule; reason?: string } {
  if (!discount) return {}
  const reason = discount.reason.trim()
  if (reason.length < 3) throw new ValidationError("Say why the discount is given.")
  if (discount.kind === "percent") {
    const bp = Math.round(discount.value * 100)
    if (!(discount.value > 0) || discount.value > 100 || bp / 100 !== discount.value)
      throw new ValidationError(
        "A percentage must be above 0 and at most 100, with up to two decimals."
      )
    return { rule: { type: "percent", percent: discount.value }, reason: reason.slice(0, 200) }
  }
  if (!Number.isSafeInteger(discount.value) || discount.value <= 0)
    throw new ValidationError("Enter a discount above zero.")
  if (discount.value > subtotalPaise)
    throw new ValidationError("The discount cannot be more than the bill.")
  return { rule: { type: "flat", amountPaise: discount.value }, reason: reason.slice(0, 200) }
}

async function quote(rawLines: OfflineLineInput[], discount: ShopDiscount | undefined) {
  const lines = mergeLines(rawLines)
  const { cart, source } = await priceWithSource(lines)
  if (!cart.canCheckout) {
    const bad = cart.lines.find((l) => l.status !== "ok")
    throw new ValidationError(
      bad ? `${bad.name}: ${bad.message ?? "cannot be sold."}` : "Some items cannot be sold."
    )
  }
  const settings = await getCommerceSettings()
  const { rule, reason } = discountRule(discount, cart.subtotalPaise)
  const totals = computeTotals({
    lines: cart.lines.map((l) => ({
      id: l.variantId,
      linePaise: l.linePaise,
      taxRatePercent: source.get(l.variantId)?.product.taxRatePercent ?? undefined,
    })),
    coupon: rule,
    // Nothing is posted: no shipping on a sale over the counter.
    shipping: { flatRatePaise: 0 },
    tax: settings.tax,
  })
  if (totals.totalPaise < MIN_TOTAL_PAISE)
    throw new ValidationError("The total must be at least ₹1.")
  return { cart, source, totals, reason }
}

export type OfflinePreview = {
  lines: { variantId: string; name: string; quantity: string; linePaise: number }[]
  subtotalPaise: number
  discountPaise: number
  totalPaise: number
}

export async function previewOfflineOrder(
  actor: Actor,
  lines: OfflineLineInput[],
  discount?: ShopDiscount
): Promise<OfflinePreview> {
  assertPermission(actor, "orders:create_offline")
  const { cart, totals } = await quote(lines, discount)
  return {
    lines: cart.lines.map((l) => ({
      variantId: l.variantId,
      name: l.name,
      quantity: formatQuantity(l.unit, l.qty),
      linePaise: l.linePaise,
    })),
    subtotalPaise: totals.subtotalPaise,
    discountPaise: totals.discountPaise,
    totalPaise: totals.totalPaise,
  }
}

// ------------------------------------------------------------------ recording a sale

function billName(customer: ShopCustomer | undefined) {
  const name = customer?.name?.trim().slice(0, 80)
  const raw = customer?.phone?.trim()
  let phone = ""
  if (raw) {
    const ten = normalizeIndianMobile(raw)
    if (!ten) throw new ValidationError("Enter a valid 10-digit mobile number, or leave it empty.")
    phone = toE164(ten)
  }
  return { name: name || "Walk-in customer", phone }
}

export async function createOfflineOrder(
  actor: Actor,
  input: {
    lines: OfflineLineInput[]
    customer?: ShopCustomer
    discount?: ShopDiscount
    method: PaymentMethod
    note?: string
    idempotencyKey: string
  }
): Promise<{ orderNumber: string; totalPaise: number }> {
  assertPermission(actor, "orders:create_offline")
  if (!IDEMPOTENCY.test(input.idempotencyKey)) throw new ValidationError("Please try again.")
  if (!PAYMENT_METHODS.includes(input.method))
    throw new ValidationError("Choose how the customer paid.")
  await connectDb()
  const walkIn = await getWalkInUser()
  const done = async () => {
    const found = await Order.findOne({
      userId: walkIn._id,
      idempotencyKey: input.idempotencyKey,
    }).lean<OrderDoc>()
    return found ? { orderNumber: found.orderNumber, totalPaise: found.pricing.totalPaise } : null
  }
  const earlier = await done()
  if (earlier) return earlier

  const bill = billName(input.customer)
  const { cart, source, totals, reason } = await quote(input.lines, input.discount)
  const now = new Date()
  const orderId = new mongoose.Types.ObjectId()
  const idString = String(orderId)
  let reserved = false
  let created = false
  try {
    await reserveStock(
      orderId,
      cart.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      { minutes: 5, now }
    )
    reserved = true
    const settings = await getCommerceSettings()
    const orderNumber = await nextOrderNumber(settings.numberPattern, now)
    const items: OrderItem[] = cart.lines.map((l) => {
      const t = totals.lines.find((x) => x.id === l.variantId)!
      const found = source.get(l.variantId)!
      return {
        variantId: oid(l.variantId),
        productId: found.product._id,
        slug: l.slug,
        name: l.name,
        sku: l.sku,
        colorName: l.colorName,
        size: l.size,
        imageUrl: l.image?.url,
        unit: l.unit,
        qty: l.qty,
        unitPricePaise: l.unitPricePaise,
        linePaise: l.linePaise,
        discountPaise: t.discountPaise,
        taxPaise: t.taxPaise,
        taxRatePercent: t.taxRatePercent,
        // The bill is handed over now; nothing can be sent back through the site.
        returnable: false,
        costLinePaise:
          found.variant.costPaise === undefined
            ? undefined
            : lineSubtotalPaise(found.variant.costPaise, l.qty, l.unit),
        weightGrams: lineWeightGrams(
          l.unit,
          l.qty,
          found.variant.weightGrams ?? found.product.weightGrams ?? undefined
        ),
      }
    })
    await Order.create({
      _id: orderId,
      orderNumber,
      userId: walkIn._id,
      email: WALK_IN_EMAIL,
      status: "completed",
      paymentStatus: "paid",
      fulfillmentStatus: "delivered",
      channel: "store",
      paymentMethod: input.method,
      soldBy: oid(actor.id),
      ...(reason ? { discountReason: reason } : {}),
      items,
      pricing: {
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        shippingPaise: 0,
        taxPaise: totals.taxPaise,
        taxExclusive: totals.taxExclusive,
        totalPaise: totals.totalPaise,
      },
      shippingAddress: {
        fullName: bill.name,
        phone: bill.phone,
        line1: "Bought in the shop",
        city: "In store",
        state: "In store",
        pincode: "",
      },
      gateway: "store",
      gatewayOrderId: `store:${orderNumber}`,
      idempotencyKey: input.idempotencyKey,
      reservationExpiresAt: now,
      placedAt: now,
      deliveredAt: now,
      statusHistory: [
        {
          to: "completed",
          event: "store.sale",
          actor: `staff:${actor.id}`,
          at: now,
          ...(input.note?.trim() ? { note: input.note.trim().slice(0, 200) } : {}),
        },
      ],
    })
    created = true
    await Payment.create({
      orderId,
      gateway: "store",
      method: input.method,
      gatewayOrderId: `store:${orderNumber}`,
      amountPaise: totals.totalPaise,
      status: "captured",
      capturedAt: now,
    })
    await commitReservation(idString)
    // The number is also issued on first view, so a hiccup here does not undo the sale.
    await ensureInvoice(idString, now).catch((error) =>
      logger.error(
        { event: "store_sale.invoice_failed", orderId: idString, errorName: (error as Error).name },
        "Sale recorded, invoice number not issued yet"
      )
    )
    await recordAudit({
      action: "order.store_sale",
      actor,
      entityType: "order",
      entityId: idString,
      details: {
        orderNumber,
        totalPaise: totals.totalPaise,
        method: input.method,
        lines: items.length,
        discountPaise: totals.discountPaise,
        ...(reason ? { discountReason: reason } : {}),
      },
    })
    return { orderNumber, totalPaise: totals.totalPaise }
  } catch (error) {
    // Undo whatever this attempt did, so a failed sale leaves nothing behind.
    if (created) {
      await Payment.deleteOne({ orderId }).catch(() => undefined)
      await Order.deleteOne({ _id: orderId }).catch(() => undefined)
    }
    if (reserved) await releaseReservation(idString).catch(() => undefined)
    if ((error as { code?: number }).code === 11000) {
      const winner = await done()
      if (winner) return winner
    }
    if (error instanceof InsufficientStockError)
      throw new ValidationError("There is not enough stock for one of the items.")
    throw error
  }
}

// ------------------------------------------------------------------ voiding a sale

/** A sale recorded by mistake: the stock goes back and the order is cancelled. Shop sales only, once. */
export async function voidOfflineOrder(
  actor: Actor,
  orderNumber: string,
  reason: string
): Promise<void> {
  assertPermission(actor, "orders:create_offline")
  const why = reason.trim()
  if (why.length < 3) throw new ValidationError("Say why the sale is being voided.")
  await connectDb()
  const order = await Order.findOne({ orderNumber, channel: "store" }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that sale.")
  const { changed } = await transitionOrder(String(order._id), "store.void", {
    actor: `staff:${actor.id}`,
    note: why.slice(0, 200),
    set: {
      cancelledAt: new Date(),
      cancelReason: why.slice(0, 300),
      refundedPaise: order.pricing.totalPaise,
    },
  })
  if (!changed) throw new ValidationError("This sale has already been voided.")
  for (const item of order.items)
    await adjustStock({
      variantId: item.variantId,
      delta: item.qty,
      type: "restock",
      reason: `Sale ${order.orderNumber} voided`,
      idempotencyKey: `void-restock:${order._id}:${item.variantId}`,
      orderId: order._id,
      actorId: actor.id,
    })
  await recordAudit({
    action: "order.store_void",
    actor,
    entityType: "order",
    entityId: String(order._id),
    details: { orderNumber, totalPaise: order.pricing.totalPaise, reason: why.slice(0, 100) },
  })
}
