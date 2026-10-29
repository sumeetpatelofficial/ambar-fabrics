import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { MOCK_SECRET, recordMockPayment } from "@/lib/payments/mock"
import { signCheckout, signWebhook } from "@/lib/payments/signature"
import { Address } from "@/models/address"
import { Cart } from "@/models/cart"
import { Coupon } from "@/models/coupon"
import { InventoryReservation } from "@/models/inventory-reservation"
import { Job } from "@/models/job"
import { Order, type OrderDoc } from "@/models/order"
import { Payment } from "@/models/payment"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { Refund } from "@/models/refund"
import { WebhookEvent } from "@/models/webhook-event"
import { addToCart, getCartLines } from "@/services/cart-service"
import {
  cancelPendingOrder,
  createCheckout,
  expirePendingOrders,
  getOrderForUser,
  markPaymentCaptured,
  resumeCheckout,
  verifyBrowserPayment,
} from "@/services/order-service"
import { refundOrder, refundOrderAsStaff } from "@/services/refund-service"
import { handleRazorpayWebhook } from "@/services/webhook-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => new mongoose.Types.ObjectId()
let key = 0
const idem = () => `test-key-${String(++key).padStart(8, "0")}-abcdefgh`

beforeAll(async () => {
  replSet = await startDatabase("orders_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
})

async function variantOf(slug: string, index = 0) {
  const p = await Product.findOne({ slug }).lean()
  const vs = await ProductVariant.find({ productId: p!._id, status: "active" })
    .sort({ sortOrder: 1, sku: 1 })
    .lean<ProductVariantDoc[]>()
  return vs[index]!
}

async function customer(label = "a") {
  const userId = String(oid())
  const address = await Address.create({
    userId,
    fullName: "Meera Shah",
    phone: "9876543210",
    line1: "12 Station Road",
    city: "Surat",
    state: "Gujarat",
    pincode: "395003",
  })
  return { userId, email: `${label}-${userId}@example.com`, addressId: String(address._id) }
}

/** A customer with 2.5 m of handloom cotton (Rs 450) in the bag. */
async function shopper(qty = 2500, slug = "handloom-cotton") {
  const c = await customer()
  const v = await variantOf(slug)
  await addToCart(c.userId, String(v._id), qty)
  return { ...c, variant: v }
}

const checkout = (c: { userId: string; email: string; addressId: string }, extra: object = {}) =>
  createCheckout({ ...c, idempotencyKey: idem(), now: NOW, ...extra })

/** Pretends the customer paid at the gateway, and returns what the browser would send back. */
function pay(
  session: { gatewayOrderId: string; amountPaise: number },
  paymentId = `pay_${idem()}`
) {
  recordMockPayment({
    id: paymentId,
    gatewayOrderId: session.gatewayOrderId,
    amountPaise: session.amountPaise,
    status: "captured",
  })
  return { paymentId, signature: signCheckout(MOCK_SECRET, session.gatewayOrderId, paymentId) }
}

const stockOf = async (id: unknown) => (await ProductVariant.findById(id).lean())!.stock

function webhook(type: string, entity: Record<string, unknown>, eventId = idem(), key = "payment") {
  const rawBody = JSON.stringify({ event: type, payload: { [key]: { entity } } })
  return { rawBody, signature: signWebhook(MOCK_SECRET, rawBody), eventId }
}

describe("creating an order", () => {
  it("prices on the server, holds the stock and numbers the order", async () => {
    const c = await shopper()
    const session = await checkout(c)
    expect(session.orderNumber).toBe("AM-2610-000001")
    expect(session.amountPaise).toBe(45000 + 8000) // 2.5 m at Rs 180 plus flat shipping under Rs 1,500
    const order = (await Order.findOne({ orderNumber: session.orderNumber }).lean<OrderDoc>())!
    expect(order).toMatchObject({
      status: "pending_payment",
      paymentStatus: "unpaid",
      email: c.email,
    })
    expect(order.items[0]).toMatchObject({
      qty: 2500,
      unitPricePaise: 18000,
      linePaise: 45000,
      returnable: false,
    })
    expect(order.shippingAddress.pincode).toBe("395003")
    expect((await stockOf(c.variant._id)).reserved).toBe(2500)
    expect(await InventoryReservation.countDocuments({ status: "active" })).toBe(1)
    expect(await Payment.countDocuments({ status: "created" })).toBe(1)
  })

  it("waives shipping at the threshold", async () => {
    const c = await shopper(9000) // 9 m = Rs 1,620
    const session = await checkout(c)
    expect(session.amountPaise).toBe(162000)
  })

  it("returns the same order for the same key, even when sent many times at once", async () => {
    const c = await shopper()
    const k = idem()
    const sessions = await Promise.all(
      Array.from({ length: 5 }, () => createCheckout({ ...c, idempotencyKey: k, now: NOW }))
    )
    expect(new Set(sessions.map((s) => s.orderNumber)).size).toBe(1)
    expect(await Order.countDocuments()).toBe(1)
    expect((await stockOf(c.variant._id)).reserved).toBe(2500)
  })

  it("refuses an empty bag, another person's address and a bad key", async () => {
    const empty = await customer()
    await expect(checkout(empty)).rejects.toThrow(/empty/i)
    const c = await shopper()
    const other = await customer("b")
    await expect(checkout({ ...c, addressId: other.addressId })).rejects.toThrow(/not found/i)
    await expect(createCheckout({ ...c, idempotencyKey: "short", now: NOW })).rejects.toThrow()
    expect(await Order.countDocuments()).toBe(0)
  })

  it("only one of two shoppers wins the last stock, and the loser holds nothing", async () => {
    const a = await shopper(3000, "tissue-fabric")
    const b = await customer("b")
    await addToCart(b.userId, String(a.variant._id), 3000)
    const results = await Promise.allSettled([checkout(a), checkout(b)])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await Order.countDocuments()).toBe(1)
    expect((await stockOf(a.variant._id)).reserved).toBe(3000)
  })

  it("applies a coupon and shares it across lines", async () => {
    await Coupon.create({ code: "WELCOME10", type: "percent", percent: 10, minOrderPaise: 10000 })
    const c = await shopper()
    const session = await checkout(c, { couponCode: "welcome10" })
    expect(session.amountPaise).toBe(45000 - 4500 + 8000)
    const order = (await Order.findOne({ orderNumber: session.orderNumber }).lean<OrderDoc>())!
    expect(order.coupon?.code).toBe("WELCOME10")
    expect(order.items[0]!.discountPaise).toBe(4500)
    expect((await Coupon.findOne({ code: "WELCOME10" }).lean())?.usedCount).toBe(1)
  })

  it("rejects codes that are unknown, expired, too small or used up, without taking anything", async () => {
    await Coupon.create([
      { code: "OLD", type: "flat", amountPaise: 1000, endsAt: new Date("2026-01-01") },
      { code: "BIG", type: "flat", amountPaise: 1000, minOrderPaise: 999999 },
      { code: "ONCE", type: "flat", amountPaise: 1000, usageLimit: 1, usedCount: 1 },
      { code: "OFF", type: "flat", amountPaise: 1000, active: false },
    ])
    const c = await shopper()
    for (const code of ["NOPE", "OLD", "BIG", "ONCE", "OFF", "x'; drop", "$ne"])
      await expect(checkout(c, { couponCode: code }), code).rejects.toThrow()
    expect(await Order.countDocuments()).toBe(0)
    expect((await stockOf(c.variant._id)).reserved).toBe(0)
  })

  it("lets a limited coupon be used once even when many shoppers try at the same time", async () => {
    await Coupon.create({ code: "LAST", type: "flat", amountPaise: 1000, usageLimit: 1 })
    const shoppers = await Promise.all(Array.from({ length: 5 }, () => shopper()))
    const results = await Promise.allSettled(
      shoppers.map((s) => checkout(s, { couponCode: "LAST" }))
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect((await Coupon.findOne({ code: "LAST" }).lean())?.usedCount).toBe(1)
    expect(await InventoryReservation.countDocuments({ status: "active" })).toBe(1)
  })

  it("limits a coupon per person", async () => {
    await Coupon.create({ code: "ONEEACH", type: "flat", amountPaise: 1000 })
    const c = await shopper()
    await checkout(c, { couponCode: "ONEEACH" })
    await addToCart(c.userId, String(c.variant._id), 500)
    await expect(checkout(c, { couponCode: "ONEEACH" })).rejects.toThrow(/already used/i)
  })

  it("only the owner can read an order", async () => {
    const c = await shopper()
    const s = await checkout(c)
    expect((await getOrderForUser(c.userId, s.orderNumber))?.orderNumber).toBe(s.orderNumber)
    expect(await getOrderForUser(String(oid()), s.orderNumber)).toBeNull()
  })
})

describe("paying", () => {
  it("confirms once the browser's proof checks out, takes the stock, queues one email and tidies the bag", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const proof = pay(s)
    expect(
      await verifyBrowserPayment({ userId: c.userId, orderNumber: s.orderNumber, ...proof })
    ).toBe("confirmed")
    const order = (await Order.findOne({ orderNumber: s.orderNumber }).lean<OrderDoc>())!
    expect(order).toMatchObject({ status: "confirmed", paymentStatus: "paid" })
    expect(order.statusHistory.map((h) => h.event)).toEqual([
      "checkout.created",
      "payment.captured",
    ])
    expect(await stockOf(c.variant._id)).toMatchObject({
      reserved: 0,
      onHand: c.variant.stock.onHand - 2500,
    })
    expect(await Job.countDocuments({ "payload.template": "order_confirmed" })).toBe(1)
    expect(await getCartLines(c.userId)).toEqual([])
    // Doing it again changes nothing.
    expect(
      await verifyBrowserPayment({ userId: c.userId, orderNumber: s.orderNumber, ...proof })
    ).toBe("already_confirmed")
    expect(await Job.countDocuments({ "payload.template": "order_confirmed" })).toBe(1)
    expect(await stockOf(c.variant._id)).toMatchObject({ onHand: c.variant.stock.onHand - 2500 })
  })

  it("rejects a forged or foreign proof and leaves the order unpaid", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const real = pay(s)
    await expect(
      verifyBrowserPayment({
        userId: c.userId,
        orderNumber: s.orderNumber,
        paymentId: real.paymentId,
        signature: "0".repeat(64),
      })
    ).rejects.toThrow()
    const other = await customer("b")
    await expect(
      verifyBrowserPayment({ userId: other.userId, orderNumber: s.orderNumber, ...real })
    ).rejects.toThrow(/not find/i)
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe(
      "pending_payment"
    )
  })

  it("does not confirm a payment for a different amount", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const outcome = await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_x",
      amountPaise: 100,
    })
    expect(outcome).toBe("needs_attention")
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe(
      "needs_attention"
    )
  })

  it("refunds a second payment for an order already paid", async () => {
    const c = await shopper()
    const s = await checkout(c)
    await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_first",
      amountPaise: s.amountPaise,
    })
    const again = await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_second",
      amountPaise: s.amountPaise,
    })
    expect(again).toBe("duplicate_payment_refunded")
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe("confirmed")
  })

  it("lets a failed attempt be retried", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const failed = webhook("payment.failed", {
      id: "pay_1",
      order_id: s.gatewayOrderId,
      error_code: "BAD_REQUEST_ERROR",
    })
    expect((await handleRazorpayWebhook(failed)).status).toBe(200)
    expect(await Order.findOne({ orderNumber: s.orderNumber }).lean()).toMatchObject({
      status: "pending_payment",
      paymentStatus: "failed",
    })
    expect((await resumeCheckout(c.userId, s.orderNumber, NOW)).gatewayOrderId).toBe(
      s.gatewayOrderId
    )
    expect(
      await markPaymentCaptured({
        gatewayOrderId: s.gatewayOrderId,
        paymentId: "pay_2",
        amountPaise: s.amountPaise,
      })
    ).toBe("confirmed")
  })

  it("cancelling an unpaid order gives back the stock and the coupon", async () => {
    await Coupon.create({ code: "TRY", type: "flat", amountPaise: 1000 })
    const c = await shopper()
    const s = await checkout(c, { couponCode: "TRY" })
    await cancelPendingOrder(c.userId, s.orderNumber)
    expect((await stockOf(c.variant._id)).reserved).toBe(0)
    expect((await Coupon.findOne({ code: "TRY" }).lean())?.usedCount).toBe(0)
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe("cancelled")
    await cancelPendingOrder(c.userId, s.orderNumber) // twice is fine
    expect((await Coupon.findOne({ code: "TRY" }).lean())?.usedCount).toBe(0)
  })
})

describe("webhooks", () => {
  it("rejects a bad or missing signature and a missing event id", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const good = webhook("payment.captured", {
      id: "pay_w",
      order_id: s.gatewayOrderId,
      amount: s.amountPaise,
    })
    expect((await handleRazorpayWebhook({ ...good, signature: "f".repeat(64) })).status).toBe(401)
    expect((await handleRazorpayWebhook({ ...good, signature: null })).status).toBe(401)
    expect((await handleRazorpayWebhook({ ...good, eventId: null })).status).toBe(400)
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe(
      "pending_payment"
    )
  })

  it("confirms on capture, ignores a repeated delivery, and a different event for the same payment changes nothing", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const entity = { id: "pay_w", order_id: s.gatewayOrderId, amount: s.amountPaise }
    const first = webhook("payment.captured", entity)
    expect((await handleRazorpayWebhook(first)).body).toEqual({ received: true })
    expect((await handleRazorpayWebhook(first)).body).toEqual({ duplicate: true })
    const paid = webhook("order.paid", entity)
    expect((await handleRazorpayWebhook(paid)).status).toBe(200)
    expect(await Job.countDocuments({ "payload.template": "order_confirmed" })).toBe(1)
    expect(await stockOf(c.variant._id)).toMatchObject({
      reserved: 0,
      onHand: c.variant.stock.onHand - 2500,
    })
    expect(await WebhookEvent.countDocuments()).toBe(2)
  })

  it("a late 'failed' event cannot undo a paid order", async () => {
    const c = await shopper()
    const s = await checkout(c)
    await handleRazorpayWebhook(
      webhook("payment.captured", {
        id: "pay_w",
        order_id: s.gatewayOrderId,
        amount: s.amountPaise,
      })
    )
    await handleRazorpayWebhook(
      webhook("payment.failed", { id: "pay_old", order_id: s.gatewayOrderId })
    )
    expect(await Order.findOne({ orderNumber: s.orderNumber }).lean()).toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
    })
  })

  it("the same capture arriving many times at once confirms exactly once", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const entity = { id: "pay_w", order_id: s.gatewayOrderId, amount: s.amountPaise }
    await Promise.all(
      Array.from({ length: 6 }, () => handleRazorpayWebhook(webhook("payment.captured", entity)))
    )
    expect(await Job.countDocuments({ "payload.template": "order_confirmed" })).toBe(1)
    expect(await stockOf(c.variant._id)).toMatchObject({
      reserved: 0,
      onHand: c.variant.stock.onHand - 2500,
    })
  })

  it("ignores events it does not use and orders it does not know", async () => {
    expect((await handleRazorpayWebhook(webhook("subscription.charged", { id: "x" }))).status).toBe(
      200
    )
    expect(
      (
        await handleRazorpayWebhook(
          webhook("payment.captured", { id: "p", order_id: "order_unknown", amount: 100 })
        )
      ).status
    ).toBe(200)
  })
})

describe("expiry and late payments", () => {
  const later = new Date(NOW.getTime() + 30 * 60_000)

  it("expires unpaid orders and gives back stock and coupon", async () => {
    await Coupon.create({ code: "EXP", type: "flat", amountPaise: 1000 })
    const c = await shopper()
    const s = await checkout(c, { couponCode: "EXP" })
    expect(await expirePendingOrders(NOW)).toBe(0) // not yet due
    expect(await expirePendingOrders(later)).toBe(1)
    expect(await expirePendingOrders(later)).toBe(0)
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe("expired")
    expect((await stockOf(c.variant._id)).reserved).toBe(0)
    expect((await Coupon.findOne({ code: "EXP" }).lean())?.usedCount).toBe(0)
  })

  it("finds a payment whose webhook never arrived instead of expiring the order", async () => {
    const c = await shopper()
    const s = await checkout(c)
    pay(s) // paid at the gateway; nothing told us
    expect(await expirePendingOrders(later)).toBe(0)
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe("confirmed")
  })

  it("accepts a payment after expiry when the stock is still there", async () => {
    const c = await shopper()
    const s = await checkout(c)
    await expirePendingOrders(later)
    const outcome = await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_late",
      amountPaise: s.amountPaise,
    })
    expect(outcome).toBe("confirmed")
    expect(await stockOf(c.variant._id)).toMatchObject({
      reserved: 0,
      onHand: c.variant.stock.onHand - 2500,
    })
  })

  it("refunds automatically when the payment comes after expiry and the stock has gone", async () => {
    const a = await shopper(3000, "tissue-fabric")
    const s = await checkout(a)
    await expirePendingOrders(later)
    const b = await customer("b")
    await addToCart(b.userId, String(a.variant._id), 3000)
    const second = await checkout(b, { now: later })
    await markPaymentCaptured({
      gatewayOrderId: second.gatewayOrderId,
      paymentId: "pay_b",
      amountPaise: second.amountPaise,
    })
    const outcome = await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_a",
      amountPaise: s.amountPaise,
    })
    expect(outcome).toBe("needs_attention")
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.status).toBe(
      "needs_attention"
    )
    const refunds = await Refund.find({}).lean()
    expect(refunds).toHaveLength(1)
    expect(refunds[0]).toMatchObject({ amountPaise: s.amountPaise, status: "processed" })
    expect((await Order.findOne({ orderNumber: s.orderNumber }).lean())?.paymentStatus).toBe(
      "refunded"
    )
  })

  it("refunds a payment that arrives for an order the customer already cancelled", async () => {
    const c = await shopper()
    const s = await checkout(c)
    await cancelPendingOrder(c.userId, s.orderNumber)
    expect(
      await markPaymentCaptured({
        gatewayOrderId: s.gatewayOrderId,
        paymentId: "pay_c",
        amountPaise: s.amountPaise,
      })
    ).toBe("needs_attention")
    expect(await Refund.countDocuments({ status: "processed" })).toBe(1)
  })
})

describe("refunds", () => {
  async function paidOrder() {
    const c = await shopper(9000) // Rs 1,620, free shipping
    const s = await checkout(c)
    await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_r",
      amountPaise: s.amountPaise,
    })
    const order = (await Order.findOne({ orderNumber: s.orderNumber }).lean<OrderDoc>())!
    return { c, order, orderId: String(order._id) }
  }

  it("refunds in parts and never more than was paid", async () => {
    const { orderId } = await paidOrder()
    await refundOrder({
      orderId,
      amountPaise: 62000,
      reason: "Damaged edge",
      idempotencyKey: "r-1",
    })
    expect((await Order.findById(orderId).lean())?.paymentStatus).toBe("partially_refunded")
    await expect(
      refundOrder({ orderId, amountPaise: 100001, reason: "Too much", idempotencyKey: "r-2" })
    ).rejects.toThrow(/more than/i)
    await refundOrder({ orderId, amountPaise: 100000, reason: "Rest", idempotencyKey: "r-3" })
    expect(await Order.findById(orderId).lean()).toMatchObject({
      refundedPaise: 162000,
      paymentStatus: "refunded",
    })
  })

  it("parallel refunds cannot add up to more than the total", async () => {
    const { orderId } = await paidOrder()
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        refundOrder({ orderId, amountPaise: 50000, reason: "Race", idempotencyKey: `race-${i}` })
      )
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3) // 3 x 500 = 1,500 of 1,620
    expect((await Order.findById(orderId).lean())?.refundedPaise).toBe(150000)
  })

  it("applies one request once", async () => {
    const { orderId } = await paidOrder()
    await refundOrder({ orderId, amountPaise: 10000, reason: "Once", idempotencyKey: "same" })
    await refundOrder({ orderId, amountPaise: 10000, reason: "Once", idempotencyKey: "same" })
    expect(await Refund.countDocuments()).toBe(1)
    expect((await Order.findById(orderId).lean())?.refundedPaise).toBe(10000)
  })

  it("needs the permission, and a super admin for a large amount", async () => {
    const { orderId } = await paidOrder()
    const input = { orderId, reason: "Goodwill", amountPaise: 10000 }
    const customerActor = { id: String(oid()), role: "customer" as const }
    const support = { id: String(oid()), role: "support" as const }
    const owner = { id: String(oid()), role: "super_admin" as const }
    await expect(
      refundOrderAsStaff(customerActor, { ...input, idempotencyKey: "s-1" })
    ).rejects.toThrow()
    await expect(
      refundOrderAsStaff(support, { ...input, amountPaise: 600000, idempotencyKey: "s-2" })
    ).rejects.toThrow()
    await expect(
      refundOrderAsStaff(owner, { ...input, idempotencyKey: "s-3" })
    ).resolves.toBeTruthy()
  })

  it("refuses to refund an unpaid order", async () => {
    const c = await shopper()
    const s = await checkout(c)
    const order = (await Order.findOne({ orderNumber: s.orderNumber }).lean<OrderDoc>())!
    await expect(
      refundOrder({
        orderId: String(order._id),
        amountPaise: 100,
        reason: "x",
        idempotencyKey: "u-1",
      })
    ).rejects.toThrow(/no payment/i)
    expect(await Cart.countDocuments()).toBe(1)
  })
})
