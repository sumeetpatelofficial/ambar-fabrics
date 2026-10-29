import "server-only"
import mongoose from "mongoose"
import { ORDER_EVENTS, type OrderEvent } from "@/features/orders/state"
import { connectDb } from "@/lib/db/mongoose"
import { AppError, NotFoundError, ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { formatQuantity, lineSubtotalPaise } from "@/lib/measure"
import { formatPaise } from "@/lib/money"
import { getPaymentGateway } from "@/lib/payments"
import { lineWeightGrams } from "@/lib/shipping/parcel"
import { computeTotals } from "@/lib/pricing/totals"
import { orderConfirmedMessage } from "@/lib/email/templates"
import { Address } from "@/models/address"
import { Counter } from "@/models/counter"
import { Order, type OrderDoc, type OrderItem } from "@/models/order"
import { Payment, type PaymentDoc } from "@/models/payment"
import { settingsRepository } from "@/repositories/settings-repository"
import { recordAudit } from "@/services/audit-service"
import { getCartLines, priceWithSource, removePurchased } from "@/services/cart-service"
import { claimCoupon, releaseCoupon, resolveCoupon, toRule } from "@/services/coupon-service"
import {
  commitReservation,
  DEFAULT_RESERVATION_MINUTES,
  InsufficientStockError,
  releaseReservation,
  reserveStock,
  reviveReservation,
} from "@/services/inventory-service"
import { enqueueEmail } from "@/services/job-service"
import { ensureInvoice } from "@/services/invoice-service"
import { refundOrder } from "@/services/refund-service"
import { assertDeliverable } from "@/services/delivery-service"

const trusted = mongoose.trusted
const oid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id))

// ------------------------------------------------------------------ settings and numbering

export async function getCommerceSettings() {
  const doc = await settingsRepository.getDefault()
  return {
    tax: doc?.tax ?? { enabled: false, mode: "inclusive" as const, defaultRatePercent: 5 },
    shipping: {
      flatRatePaise: doc?.shipping.flatRatePaise ?? 8000,
      freeThresholdPaise: doc ? doc.shipping.freeThresholdPaise : 150000,
    },
    reservationMinutes: doc?.inventory.reservationMinutes ?? DEFAULT_RESERVATION_MINUTES,
    returnWindowDays: doc?.orders.returnWindowDays ?? 7,
    numberPattern: doc?.orders.numberPattern ?? "AM-{YY}{MM}-{SEQ6}",
  }
}

/** Atomic and never reused: a failed checkout leaves a gap in the numbers, which is fine for order numbers. */
export async function nextOrderNumber(pattern: string, now = new Date()): Promise<string> {
  await connectDb()
  const yy = String(now.getUTCFullYear()).slice(-2)
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const counter = await Counter.findOneAndUpdate(
    { _id: `order:${yy}${mm}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  ).lean()
  return pattern
    .replace("{YY}", yy)
    .replace("{MM}", mm)
    .replace("{SEQ6}", String(counter!.seq).padStart(6, "0"))
}

// ------------------------------------------------------------------ state changes

export async function transitionOrder(
  orderId: string,
  event: OrderEvent,
  options: { actor: string; note?: string; set?: Record<string, unknown> }
): Promise<{ changed: boolean; order: OrderDoc | null }> {
  await connectDb()
  const rule = ORDER_EVENTS[event]
  const paymentStatus = "paymentStatus" in rule ? rule.paymentStatus : undefined
  const at = new Date()
  const before = await Order.findOneAndUpdate(
    { _id: oid(orderId), status: trusted({ $in: [...rule.from] }) },
    {
      $set: { status: rule.to, ...(paymentStatus ? { paymentStatus } : {}), ...options.set },
      $push: {
        statusHistory: {
          from: rule.from.join("|"),
          to: rule.to,
          event,
          actor: options.actor,
          at,
          ...(options.note ? { note: options.note } : {}),
        },
      },
    },
    { returnDocument: "before" }
  ).lean<OrderDoc>()
  const order = await Order.findById(oid(orderId)).lean<OrderDoc>()
  return { changed: before !== null, order }
}

// ------------------------------------------------------------------ checkout

export type CheckoutSession = {
  orderNumber: string
  gateway: "razorpay" | "mock"
  gatewayOrderId: string
  amountPaise: number
  publicKey: string
  expiresAt: string
  prefill: { name: string; email: string; phone: string }
}

const IDEMPOTENCY = /^[A-Za-z0-9_-]{16,100}$/

async function sessionFor(order: OrderDoc): Promise<CheckoutSession> {
  const gateway = getPaymentGateway()
  return {
    orderNumber: order.orderNumber,
    gateway: order.gateway === "store" ? "mock" : order.gateway,
    gatewayOrderId: order.gatewayOrderId!,
    amountPaise: order.pricing.totalPaise,
    publicKey: gateway.publicKey,
    expiresAt: order.reservationExpiresAt.toISOString(),
    prefill: {
      name: order.shippingAddress.fullName,
      email: order.email,
      phone: order.shippingAddress.phone,
    },
  }
}

/**
 * Turns the signed-in customer's saved bag into an order waiting for payment. Everything is read again
 * here: prices, stock, the address (must be theirs), the coupon. Sending the same idempotency key again
 * returns the order already made. On any failure, whatever was taken (coupon use, stock) is given back.
 */
export async function createCheckout(input: {
  userId: string
  email: string
  addressId: string
  couponCode?: string
  idempotencyKey: string
  now?: Date
}): Promise<CheckoutSession> {
  if (!IDEMPOTENCY.test(input.idempotencyKey)) throw new ValidationError("Please try again.")
  await connectDb()
  const now = input.now ?? new Date()
  const userId = oid(input.userId)

  const existing = await Order.findOne({
    userId,
    idempotencyKey: input.idempotencyKey,
  }).lean<OrderDoc>()
  if (existing) return sessionFor(existing)

  const lines = await getCartLines(input.userId)
  if (lines.length === 0) throw new ValidationError("Your bag is empty.")
  const { cart, source } = await priceWithSource(lines, now)
  if (!cart.canCheckout)
    throw new ValidationError("Some items in your bag need attention. Please review your bag.")

  // Scoped by owner: someone else's address id is simply not found.
  if (!mongoose.isValidObjectId(input.addressId))
    throw new NotFoundError("That address was not found.")
  const address = await Address.findOne({ _id: oid(input.addressId), userId }).lean()
  if (!address) throw new NotFoundError("That address was not found.")

  // No point taking payment for somewhere no courier will deliver.
  await assertDeliverable(
    address.pincode,
    cart.lines.reduce((sum, l) => {
      const found = source.get(l.variantId)
      return (
        sum +
        lineWeightGrams(
          l.unit,
          l.qty,
          found?.variant.weightGrams ?? found?.product.weightGrams ?? undefined
        )
      )
    }, 0)
  )

  const settings = await getCommerceSettings()
  const coupon = input.couponCode?.trim()
    ? await resolveCoupon(input.couponCode, {
        subtotalPaise: cart.subtotalPaise,
        userId: input.userId,
        now,
      })
    : undefined

  const totals = computeTotals({
    lines: cart.lines.map((l) => ({
      id: l.variantId,
      linePaise: l.linePaise,
      taxRatePercent: source.get(l.variantId)?.product.taxRatePercent ?? undefined,
    })),
    coupon: coupon ? toRule(coupon) : undefined,
    shipping: settings.shipping,
    tax: settings.tax,
  })
  if (totals.totalPaise < 100)
    throw new ValidationError("This order total is too low to pay online.")

  const orderId = new mongoose.Types.ObjectId()
  const idString = String(orderId)
  let couponClaimed = false
  let reserved = false
  try {
    if (coupon) {
      await claimCoupon(coupon, input.userId, idString)
      couponClaimed = true
    }
    const expiresAt = new Date(now.getTime() + settings.reservationMinutes * 60_000)
    await reserveStock(
      orderId,
      cart.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      { minutes: settings.reservationMinutes, now }
    )
    reserved = true

    const orderNumber = await nextOrderNumber(settings.numberPattern, now)
    const gateway = getPaymentGateway()
    const { gatewayOrderId } = await gateway.createOrder({
      amountPaise: totals.totalPaise,
      receipt: orderNumber,
      notes: { orderNumber },
    })

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
        returnable: found.product.returnable && l.unit.kind !== "length",
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
    const [order] = await Order.create(
      [
        {
          _id: orderId,
          orderNumber,
          userId,
          email: input.email,
          items,
          pricing: {
            subtotalPaise: totals.subtotalPaise,
            discountPaise: totals.discountPaise,
            shippingPaise: totals.shippingPaise,
            taxPaise: totals.taxPaise,
            taxExclusive: totals.taxExclusive,
            totalPaise: totals.totalPaise,
          },
          ...(coupon ? { coupon: { couponId: coupon._id, code: coupon.code } } : {}),
          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
          },
          gateway: gateway.name,
          gatewayOrderId,
          idempotencyKey: input.idempotencyKey,
          reservationExpiresAt: expiresAt,
          statusHistory: [
            {
              to: "pending_payment",
              event: "checkout.created",
              actor: `user:${input.userId}`,
              at: now,
            },
          ],
        },
      ],
      {}
    )
    await Payment.create({
      orderId,
      gateway: gateway.name,
      gatewayOrderId,
      amountPaise: totals.totalPaise,
    })
    return sessionFor(order!.toObject() as OrderDoc)
  } catch (error) {
    // The same request arriving twice at once: the other one made the order. Give back what this one took.
    const duplicate = (error as { code?: number }).code === 11000
    if (reserved) await releaseReservation(idString).catch(() => undefined)
    if (couponClaimed) await releaseCoupon(idString).catch(() => undefined)
    if (duplicate) {
      const winner = await Order.findOne({
        userId,
        idempotencyKey: input.idempotencyKey,
      }).lean<OrderDoc>()
      if (winner) return sessionFor(winner)
    }
    if (error instanceof InsufficientStockError)
      throw new ValidationError(
        "Some items are no longer available in that quantity. Please review your bag."
      )
    throw error
  }
}

/** The payment window for an order still waiting for payment (to retry after a closed window or failure). */
export async function resumeCheckout(userId: string, orderNumber: string, now = new Date()) {
  await connectDb()
  const order = await Order.findOne({ orderNumber, userId: oid(userId) }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  if (order.status !== "pending_payment" || order.reservationExpiresAt <= now)
    throw new ValidationError("That order can no longer be paid. Please start again from your bag.")
  return sessionFor(order)
}

/** Customer gives up on an unpaid order: stock and coupon use go back. */
export async function cancelPendingOrder(userId: string, orderNumber: string) {
  await connectDb()
  const order = await Order.findOne({ orderNumber, userId: oid(userId) }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  const { changed } = await transitionOrder(String(order._id), "customer.cancel", {
    actor: `user:${userId}`,
    set: { cancelledAt: new Date(), cancelReason: "Cancelled by customer before payment" },
  })
  if (changed) {
    await releaseReservation(String(order._id))
    await releaseCoupon(String(order._id))
  }
}

// ------------------------------------------------------------------ payment results

async function sendConfirmation(order: OrderDoc) {
  const lines = order.items.map((i) => ({
    name: i.name,
    quantity: formatQuantity(i.unit, i.qty),
    amount: formatPaise(i.linePaise),
  }))
  const a = order.shippingAddress
  await enqueueEmail(
    orderConfirmedMessage({
      to: order.email,
      name: a.fullName,
      orderNumber: order.orderNumber,
      lines,
      shipping:
        order.pricing.shippingPaise === 0 ? "Free" : formatPaise(order.pricing.shippingPaise),
      discount:
        order.pricing.discountPaise > 0 ? formatPaise(order.pricing.discountPaise) : undefined,
      total: formatPaise(order.pricing.totalPaise),
      address: [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", "),
    }),
    `order-confirmed:${order._id}`
  )
}

export type CaptureOutcome =
  | "confirmed"
  | "already_confirmed"
  | "needs_attention"
  | "duplicate_payment_refunded"
  | "unknown_order"

/**
 * A payment succeeded. Called by the browser's verification, by the webhook and by reconciliation, in any
 * order and any number of times: whichever arrives first confirms the order and the rest change nothing.
 */
export async function markPaymentCaptured(input: {
  gatewayOrderId: string
  paymentId: string
  amountPaise: number
  now?: Date
}): Promise<CaptureOutcome> {
  await connectDb()
  const payment = await Payment.findOne({ gatewayOrderId: input.gatewayOrderId }).lean<PaymentDoc>()
  if (!payment) return "unknown_order"
  const orderId = String(payment.orderId)
  const order = await Order.findById(payment.orderId).lean<OrderDoc>()
  if (!order) return "unknown_order"

  // A second, different payment for an order that is already paid: the customer paid twice. Return it.
  if (
    payment.status === "captured" &&
    payment.gatewayPaymentId &&
    payment.gatewayPaymentId !== input.paymentId
  ) {
    await refundDuplicate(order, input.paymentId, input.amountPaise)
    return "duplicate_payment_refunded"
  }

  if (input.amountPaise !== order.pricing.totalPaise || input.amountPaise !== payment.amountPaise) {
    // Never confirm an order for a different amount than it was priced at.
    logger.error(
      { event: "payment.amount_mismatch", orderId },
      "Payment amount does not match the order"
    )
    await Payment.updateOne({ _id: payment._id }, { $set: { gatewayPaymentId: input.paymentId } })
    await transitionOrder(orderId, "payment.unfulfillable", {
      actor: "system",
      note: "Amount mismatch",
    })
    await recordAudit({ action: "payment.amount_mismatch", entityType: "order", entityId: orderId })
    return "needs_attention"
  }

  const marked = await Payment.updateOne(
    { _id: payment._id, status: trusted({ $ne: "captured" }) },
    {
      $set: {
        status: "captured",
        gatewayPaymentId: input.paymentId,
        capturedAt: input.now ?? new Date(),
      },
    }
  )
  void marked

  if (order.status === "confirmed" || order.status === "processing" || order.status === "completed")
    return "already_confirmed"

  if (order.status === "cancelled" || order.status === "needs_attention") {
    await failPaidOrder(order, input.paymentId, "Paid after the order was cancelled")
    return "needs_attention"
  }

  // pending_payment, or expired and the stock may still be there.
  try {
    if (order.status === "expired") await reviveReservation(orderId)
    await commitReservation(orderId) // false when already committed by an earlier, interrupted attempt
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      await failPaidOrder(
        order,
        input.paymentId,
        "Paid after the hold ran out and the stock was gone"
      )
      return "needs_attention"
    }
    throw error
  }
  const { changed, order: updated } = await transitionOrder(
    orderId,
    order.status === "expired" ? "payment.captured_late" : "payment.captured",
    { actor: "payment", set: { placedAt: new Date() } }
  )
  if (changed && updated) {
    await ensureInvoice(String(updated._id), input.now).catch(() => undefined) // made on first view if this fails
    await sendConfirmation(updated)
    await removePurchased(
      String(updated.userId),
      updated.items.map((i) => ({ variantId: String(i.variantId), qty: i.qty }))
    ).catch(() => undefined) // a bag that cannot be tidied must not undo a confirmed order
  }
  return changed ? "confirmed" : "already_confirmed"
}

async function failPaidOrder(order: OrderDoc, paymentId: string, note: string) {
  await transitionOrder(String(order._id), "payment.unfulfillable", { actor: "system", note })
  await recordAudit({
    action: "payment.unfulfillable",
    entityType: "order",
    entityId: String(order._id),
    details: { note },
  })
  // The money is returned automatically; staff are told through the status and the audit log.
  await refundOrder({
    orderId: String(order._id),
    amountPaise: order.pricing.totalPaise,
    reason: note,
    idempotencyKey: `auto:${order._id}:${paymentId}`,
  }).catch((error) =>
    logger.error(
      { event: "refund.auto_failed", orderId: String(order._id), errorName: (error as Error).name },
      "Automatic refund failed"
    )
  )
}

async function refundDuplicate(order: OrderDoc, paymentId: string, amountPaise: number) {
  await recordAudit({
    action: "payment.duplicate",
    entityType: "order",
    entityId: String(order._id),
  })
  await getPaymentGateway()
    .refund({
      paymentId,
      amountPaise,
      idempotencyKey: `dup:${order._id}:${paymentId}`,
      notes: { reason: "duplicate payment" },
    })
    .catch((error) =>
      logger.error(
        {
          event: "refund.duplicate_failed",
          orderId: String(order._id),
          errorName: (error as Error).name,
        },
        "Duplicate refund failed"
      )
    )
}

/** A payment attempt failed. Never changes an order that is already paid (webhooks can arrive late or out of order). */
export async function markPaymentFailed(input: {
  gatewayOrderId: string
  errorCode?: string
  errorDescription?: string
}) {
  await connectDb()
  const payment = await Payment.findOne({ gatewayOrderId: input.gatewayOrderId }).lean<PaymentDoc>()
  if (!payment || payment.status === "captured") return
  await Payment.updateOne(
    { _id: payment._id, status: trusted({ $ne: "captured" }) },
    {
      $set: {
        status: "failed",
        errorCode: input.errorCode?.slice(0, 100),
        errorDescription: input.errorDescription?.slice(0, 300),
      },
    }
  )
  await transitionOrder(String(payment.orderId), "payment.failed", { actor: "payment" })
}

/**
 * The browser says the customer paid. The signature proves the gateway issued it; the gateway is asked
 * for the payment itself so the amount and order are confirmed from the source, not from the browser.
 */
export async function verifyBrowserPayment(input: {
  userId: string
  orderNumber: string
  paymentId: string
  signature: string
}): Promise<CaptureOutcome | "pending"> {
  await connectDb()
  const order = await Order.findOne({
    orderNumber: input.orderNumber,
    userId: oid(input.userId),
  }).lean<OrderDoc>()
  if (!order || !order.gatewayOrderId) throw new NotFoundError("We could not find that order.")
  const gateway = getPaymentGateway()
  if (
    !gateway.verifyPaymentSignature({
      gatewayOrderId: order.gatewayOrderId,
      paymentId: input.paymentId,
      signature: input.signature,
    })
  )
    throw new AppError("PAYMENT_SIGNATURE_INVALID", "We could not confirm that payment.", 400)
  const payment = await gateway.fetchPayment(input.paymentId)
  if (payment.gatewayOrderId !== order.gatewayOrderId)
    throw new AppError("PAYMENT_SIGNATURE_INVALID", "We could not confirm that payment.", 400)
  if (payment.status !== "captured") return "pending" // still settling; the webhook will confirm it
  return markPaymentCaptured({
    gatewayOrderId: order.gatewayOrderId,
    paymentId: payment.id,
    amountPaise: payment.amountPaise,
  })
}

// ------------------------------------------------------------------ expiry and reconciliation

/**
 * Orders whose payment window has closed. Each is first checked with the gateway, so a payment whose
 * webhook never arrived is not thrown away; otherwise the order expires and the stock and coupon return.
 */
export async function expirePendingOrders(now = new Date(), limit = 50): Promise<number> {
  await connectDb()
  const due = await Order.find({
    status: "pending_payment",
    reservationExpiresAt: trusted({ $lte: now }),
  })
    .sort({ reservationExpiresAt: 1 })
    .limit(limit)
    .lean<OrderDoc[]>()
  let expired = 0
  for (const order of due) {
    try {
      const gateway = getPaymentGateway()
      const paid = order.gatewayOrderId
        ? (await gateway.fetchOrderPayments(order.gatewayOrderId)).find(
            (p) => p.status === "captured"
          )
        : undefined
      if (paid) {
        await markPaymentCaptured({
          gatewayOrderId: paid.gatewayOrderId,
          paymentId: paid.id,
          amountPaise: paid.amountPaise,
          now,
        })
        continue
      }
    } catch (error) {
      // If the gateway cannot be asked, keep the order for the next run rather than expiring a possibly paid one.
      logger.warn(
        {
          event: "order.reconcile_failed",
          orderId: String(order._id),
          errorName: (error as Error).name,
        },
        "Could not check the gateway"
      )
      continue
    }
    const { changed } = await transitionOrder(String(order._id), "expire", { actor: "system" })
    if (changed) {
      await releaseReservation(String(order._id))
      await releaseCoupon(String(order._id))
      expired += 1
    }
  }
  return expired
}

// ------------------------------------------------------------------ reading

export type OrderView = {
  orderNumber: string
  status: OrderDoc["status"]
  paymentStatus: OrderDoc["paymentStatus"]
  createdAt: string
  items: (Omit<OrderItem, "variantId" | "productId"> & { variantId: string })[]
  pricing: OrderDoc["pricing"]
  couponCode?: string
  shippingAddress: OrderDoc["shippingAddress"]
  refundedPaise: number
  reservationExpiresAt: string
  /** Where it was sold. Orders made before shop sales existed are online. */
  channel: "online" | "store"
  paymentMethod?: "cash" | "upi" | "card"
}

const toView = (o: OrderDoc): OrderView => ({
  orderNumber: o.orderNumber,
  status: o.status,
  paymentStatus: o.paymentStatus,
  createdAt: o.createdAt.toISOString(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  items: o.items.map(({ productId: _productId, variantId, ...rest }) => ({
    ...rest,
    variantId: String(variantId),
  })),
  pricing: o.pricing,
  couponCode: o.coupon?.code,
  shippingAddress: o.shippingAddress,
  refundedPaise: o.refundedPaise,
  reservationExpiresAt: o.reservationExpiresAt.toISOString(),
  channel: o.channel ?? "online",
  ...(o.paymentMethod ? { paymentMethod: o.paymentMethod } : {}),
})

/** Only the owner can read an order; anyone else gets the same "not found" as for a number that does not exist. */
export async function getOrderForUser(
  userId: string,
  orderNumber: string
): Promise<OrderView | null> {
  await connectDb()
  const order = await Order.findOne({ orderNumber, userId: oid(userId) }).lean<OrderDoc>()
  return order ? toView(order) : null
}

export async function listOrdersForUser(userId: string, limit = 50): Promise<OrderView[]> {
  await connectDb()
  const orders = await Order.find({ userId: oid(userId), status: trusted({ $ne: "expired" }) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<OrderDoc[]>()
  return orders.map(toView)
}

// ------------------------------------------------------------------ preview

export type CheckoutPreview = {
  cart: Awaited<ReturnType<typeof priceWithSource>>["cart"]
  totals: ReturnType<typeof computeTotals>
  couponCode?: string
  couponMessage?: string
}

/** What checkout would charge right now, for the review screen. Reads only; nothing is held or used. */
export async function previewCheckout(input: {
  userId: string
  couponCode?: string
  now?: Date
}): Promise<CheckoutPreview> {
  const lines = await getCartLines(input.userId)
  const { cart, source } = await priceWithSource(lines, input.now)
  const settings = await getCommerceSettings()
  let coupon
  let couponMessage: string | undefined
  if (input.couponCode?.trim()) {
    try {
      coupon = await resolveCoupon(input.couponCode, {
        subtotalPaise: cart.subtotalPaise,
        userId: input.userId,
        now: input.now,
      })
    } catch (error) {
      couponMessage =
        error instanceof ValidationError ? error.message : "That code could not be checked."
    }
  }
  const totals = computeTotals({
    lines: cart.lines
      .filter((l) => l.status === "ok")
      .map((l) => ({
        id: l.variantId,
        linePaise: l.linePaise,
        taxRatePercent: source.get(l.variantId)?.product.taxRatePercent ?? undefined,
      })),
    coupon: coupon ? toRule(coupon) : undefined,
    shipping: settings.shipping,
    tax: settings.tax,
  })
  return { cart, totals, couponCode: coupon?.code, couponMessage }
}
