import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { MOCK_SECRET, recordMockPayment } from "@/lib/payments/mock"
import { MOCK_SHIPPING_TOKEN } from "@/lib/shipping/mock"
import { Address } from "@/models/address"
import { Coupon } from "@/models/coupon"
import { Job } from "@/models/job"
import { Order, type OrderDoc } from "@/models/order"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { Refund } from "@/models/refund"
import { Shipment } from "@/models/shipment"
import { addToCart } from "@/services/cart-service"
import { cancelPaidOrder } from "@/services/cancellation-service"
import { assertDeliverable, checkDelivery } from "@/services/delivery-service"
import { createCheckout, markPaymentCaptured } from "@/services/order-service"
import { decideReturn, receiveReturn, requestReturn } from "@/services/return-service"
import {
  applyTrackingEvent,
  cancelShipmentForOrder,
  closeReturnWindows,
  createShipmentForOrder,
  handleShippingWebhook,
  syncActiveShipments,
} from "@/services/shipping-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))
void MOCK_SECRET
void recordMockPayment

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => new mongoose.Types.ObjectId()
let key = 0
const idem = () => `fulfil-key-${String(++key).padStart(8, "0")}-abcdefgh`
const staff = { id: String(oid()), role: "fulfillment_manager" as const }
const admin = { id: String(oid()), role: "super_admin" as const }
const support = { id: String(oid()), role: "support" as const }
const customerActor = (id: string) => ({ id, role: "customer" as const })

beforeAll(async () => {
  replSet = await startDatabase("fulfilment_test")
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

/** A paid order for one product. */
async function paidOrder(slug = "handloom-cotton", qty = 2500, pincode = "395003") {
  const userId = String(oid())
  const address = await Address.create({
    userId,
    fullName: "Meera Shah",
    phone: "9876543210",
    line1: "12 Station Road",
    city: "Surat",
    state: "Gujarat",
    pincode,
  })
  const variant = await variantOf(slug)
  await addToCart(userId, String(variant._id), qty)
  const session = await createCheckout({
    userId,
    email: `${userId}@example.com`,
    addressId: String(address._id),
    idempotencyKey: idem(),
    now: NOW,
  })
  await markPaymentCaptured({
    gatewayOrderId: session.gatewayOrderId,
    paymentId: `pay_${idem()}`,
    amountPaise: session.amountPaise,
  })
  const order = (await Order.findOne({ orderNumber: session.orderNumber }).lean<OrderDoc>())!
  return { userId, variant, order, orderNumber: session.orderNumber, session }
}

const stockOf = async (id: unknown) => (await ProductVariant.findById(id).lean())!.stock
const reload = (orderNumber: string) => Order.findOne({ orderNumber }).lean<OrderDoc>()
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

describe("delivery checks", () => {
  it("checks the PIN code format and what the courier serves", async () => {
    expect(await checkDelivery("12")).toEqual({ error: "Enter a 6-digit PIN code." })
    expect(await checkDelivery("395003")).toMatchObject({ serviceable: true, etaDays: 4 })
    expect(await checkDelivery("900001")).toEqual({ serviceable: false })
  })
  it("refuses an order for a PIN code nobody serves, before taking payment", async () => {
    await expect(assertDeliverable("900001", 500)).rejects.toThrow(/cannot deliver/i)
    const userId = String(oid())
    const address = await Address.create({
      userId,
      fullName: "A B",
      phone: "9876543210",
      line1: "1 Road",
      city: "X",
      state: "Gujarat",
      pincode: "900001",
    })
    const v = await variantOf("handloom-cotton")
    await addToCart(userId, String(v._id), 1000)
    await expect(
      createCheckout({
        userId,
        email: "a@example.com",
        addressId: String(address._id),
        idempotencyKey: idem(),
        now: NOW,
      })
    ).rejects.toThrow(/cannot deliver/i)
    expect(await Order.countDocuments()).toBe(0)
    expect((await stockOf(v._id)).reserved).toBe(0)
  })
  it("snapshots a parcel weight on the order", async () => {
    const { order } = await paidOrder() // 2.5 m at the default 250 g per metre
    expect(order.items[0]!.weightGrams).toBe(625)
  })
})

describe("booking a courier", () => {
  it("needs the shipments permission and a paid order", async () => {
    const { orderNumber } = await paidOrder()
    await expect(createShipmentForOrder(support, orderNumber)).rejects.toThrow()
    await expect(
      createShipmentForOrder(customerActor(String(oid())), orderNumber)
    ).rejects.toThrow()
    await expect(createShipmentForOrder(staff, "AM-0000-000000")).rejects.toThrow(/not find/i)
  })

  it("books once, moves the order into fulfilment, and refuses a second booking", async () => {
    const { orderNumber } = await paidOrder()
    const shipment = await createShipmentForOrder(staff, orderNumber)
    expect(shipment).toMatchObject({ status: "created", courier: "Mock Express" })
    expect(shipment.parcel.weightGrams).toBe(625)
    expect(await reload(orderNumber)).toMatchObject({
      status: "processing",
      fulfillmentStatus: "packed",
    })
    await expect(createShipmentForOrder(staff, orderNumber)).rejects.toThrow(/already/i)
  })

  it("two staff booking at the same moment create exactly one shipment", async () => {
    const { orderNumber } = await paidOrder()
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createShipmentForOrder(staff, orderNumber))
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await Shipment.countDocuments()).toBe(1)
  })

  it("can be cancelled before pickup and then booked again", async () => {
    const { orderNumber } = await paidOrder()
    const first = await createShipmentForOrder(staff, orderNumber)
    await cancelShipmentForOrder(staff, orderNumber)
    expect((await Shipment.findById(first._id).lean())?.status).toBe("cancelled")
    expect((await reload(orderNumber))?.fulfillmentStatus).toBe("unfulfilled")
    const second = await createShipmentForOrder(staff, orderNumber)
    expect(second.awb).not.toBe(first.awb)
  })

  it("cannot be cancelled once the courier has the parcel", async () => {
    const { orderNumber } = await paidOrder()
    const s = await createShipmentForOrder(staff, orderNumber)
    await applyTrackingEvent(s.awb, { status: "picked_up", at: at(60) })
    await expect(cancelShipmentForOrder(staff, orderNumber)).rejects.toThrow(/already collected/i)
  })
})

describe("tracking", () => {
  it("only moves forward: late, repeated and out-of-order updates change nothing", async () => {
    const { orderNumber } = await paidOrder()
    const s = await createShipmentForOrder(staff, orderNumber)
    expect(await applyTrackingEvent(s.awb, { status: "in_transit", at: at(120) })).toBe(true)
    expect(await applyTrackingEvent(s.awb, { status: "picked_up", at: at(60) })).toBe(false) // arrived late
    expect(await applyTrackingEvent(s.awb, { status: "in_transit", at: at(120) })).toBe(false) // repeated
    expect(await applyTrackingEvent(s.awb, { status: "delivered", at: at(300) })).toBe(true)
    expect(await applyTrackingEvent(s.awb, { status: "rto_initiated", at: at(400) })).toBe(false) // after delivery
    const order = (await reload(orderNumber))!
    expect(order).toMatchObject({ fulfillmentStatus: "delivered" })
    expect(order.deliveredAt?.toISOString()).toBe(at(300).toISOString())
    expect(await Job.countDocuments({ "payload.template": "order_shipped" })).toBe(1)
    expect(await Job.countDocuments({ "payload.template": "order_delivered" })).toBe(1)
  })

  it("handles a parcel that goes back to the seller", async () => {
    const { orderNumber } = await paidOrder()
    const s = await createShipmentForOrder(staff, orderNumber)
    await applyTrackingEvent(s.awb, { status: "picked_up", at: at(60) })
    await applyTrackingEvent(s.awb, { status: "rto_initiated", at: at(600) })
    await applyTrackingEvent(s.awb, { status: "rto_delivered", at: at(900) })
    expect((await reload(orderNumber))?.fulfillmentStatus).toBe("rto")
  })

  it("ignores an unknown parcel", async () => {
    expect(await applyTrackingEvent("NOSUCHAWB", { status: "delivered", at: NOW })).toBe(false)
  })

  it("catches up from the courier's history when a webhook was missed", async () => {
    const { orderNumber } = await paidOrder()
    const s = await createShipmentForOrder(staff, orderNumber)
    const { recordMockTracking } = await import("@/lib/shipping/mock")
    recordMockTracking(s.awb, { status: "picked_up", at: at(30) })
    recordMockTracking(s.awb, { status: "in_transit", at: at(90) })
    expect(await syncActiveShipments()).toBe(2)
    expect((await Shipment.findById(s._id).lean())?.status).toBe("in_transit")
    expect(await syncActiveShipments()).toBe(0)
  })
})

describe("the courier's webhook", () => {
  const post = (body: unknown, token: string | null = MOCK_SHIPPING_TOKEN) =>
    handleShippingWebhook({
      rawBody: typeof body === "string" ? body : JSON.stringify(body),
      headers: new Headers(token ? { "x-api-key": token } : {}),
    })

  it("refuses a missing or wrong token", async () => {
    const body = { awb: "X", status: "delivered", at: NOW.toISOString(), event_id: "e1" }
    expect((await post(body, null)).status).toBe(401)
    expect((await post(body, "wrong")).status).toBe(401)
  })

  it("applies an update once and recognises a repeat", async () => {
    const { orderNumber } = await paidOrder()
    const s = await createShipmentForOrder(staff, orderNumber)
    const body = { awb: s.awb, status: "picked_up", at: at(30).toISOString(), event_id: "evt-1" }
    expect((await post(body)).body).toEqual({ received: true })
    expect((await post(body)).body).toEqual({ duplicate: true })
    expect((await Shipment.findById(s._id).lean())?.status).toBe("picked_up")
    expect(await Job.countDocuments({ "payload.template": "order_shipped" })).toBe(1)
  })

  it("ignores bodies it does not understand", async () => {
    expect((await post({ hello: "world" })).body).toEqual({ ignored: true })
    expect((await post("not json")).status).toBe(400)
  })
})

describe("closing the return window", () => {
  it("completes delivered orders after the window, but not while a return is open or before", async () => {
    const { orderNumber } = await paidOrder()
    const s = await createShipmentForOrder(staff, orderNumber)
    await applyTrackingEvent(s.awb, { status: "delivered", at: NOW })
    expect(await closeReturnWindows(new Date(NOW.getTime() + 6 * 86_400_000))).toBe(0)
    expect(await closeReturnWindows(new Date(NOW.getTime() + 8 * 86_400_000))).toBe(1)
    expect((await reload(orderNumber))?.status).toBe("completed")
    expect(await closeReturnWindows(new Date(NOW.getTime() + 9 * 86_400_000))).toBe(0)
  })
})

describe("cancelling a paid order", () => {
  it("lets the customer cancel before preparation: stock back, coupon back, money refunded", async () => {
    await Coupon.create({ code: "BACK", type: "flat", amountPaise: 1000 })
    const userId = String(oid())
    const address = await Address.create({
      userId,
      fullName: "A B",
      phone: "9876543210",
      line1: "1 Road",
      city: "X",
      state: "Gujarat",
      pincode: "395003",
    })
    const v = await variantOf("handloom-cotton")
    const before = (await stockOf(v._id)).onHand
    await addToCart(userId, String(v._id), 2500)
    const session = await createCheckout({
      userId,
      email: "a@example.com",
      addressId: String(address._id),
      couponCode: "BACK",
      idempotencyKey: idem(),
      now: NOW,
    })
    await markPaymentCaptured({
      gatewayOrderId: session.gatewayOrderId,
      paymentId: "pay_x1",
      amountPaise: session.amountPaise,
    })
    expect((await stockOf(v._id)).onHand).toBe(before - 2500)

    await cancelPaidOrder(customerActor(userId), session.orderNumber, {
      reason: "Changed my mind",
      asCustomer: true,
    })
    const order = (await reload(session.orderNumber))!
    expect(order).toMatchObject({
      status: "cancelled",
      paymentStatus: "refunded",
      refundedPaise: session.amountPaise,
    })
    expect((await stockOf(v._id)).onHand).toBe(before)
    expect((await Coupon.findOne({ code: "BACK" }).lean())?.usedCount).toBe(0)
    expect(await Refund.countDocuments({ status: "processed" })).toBe(1)
    expect(await Job.countDocuments({ "payload.template": "order_cancelled" })).toBe(1)
    await expect(
      cancelPaidOrder(customerActor(userId), session.orderNumber, {
        reason: "again",
        asCustomer: true,
      })
    ).rejects.toThrow()
  })

  it("refuses a customer once a shipment is being booked, someone else's order, and a courier already holding it", async () => {
    const a = await paidOrder()
    const b = await paidOrder()
    await expect(
      cancelPaidOrder(customerActor(b.userId), a.orderNumber, { reason: "x", asCustomer: true })
    ).rejects.toThrow(/not find/i)
    await createShipmentForOrder(staff, a.orderNumber)
    await expect(
      cancelPaidOrder(customerActor(a.userId), a.orderNumber, { reason: "x", asCustomer: true })
    ).rejects.toThrow(/being prepared/i)
    await expect(cancelPaidOrder(staff, a.orderNumber, { reason: "Out of stock" })).rejects.toThrow(
      /cancel the shipment/i
    )
    const s = (await Shipment.findOne({}).lean())!
    await applyTrackingEvent(s.awb, { status: "picked_up", at: at(30) })
    await expect(cancelPaidOrder(staff, a.orderNumber, { reason: "Out of stock" })).rejects.toThrow(
      /courier already/i
    )
  })

  it("lets staff cancel with a reason, and only staff with the permission", async () => {
    const { orderNumber, userId } = await paidOrder()
    await expect(
      cancelPaidOrder(customerActor(userId), orderNumber, { reason: "x" })
    ).rejects.toThrow()
    await expect(cancelPaidOrder(staff, orderNumber, { reason: "  " })).rejects.toThrow(/why/i)
    await cancelPaidOrder(staff, orderNumber, { reason: "Fabric damaged in the warehouse" })
    expect((await reload(orderNumber))?.status).toBe("cancelled")
  })

  it("two cancellations at once refund once", async () => {
    const { orderNumber } = await paidOrder()
    const results = await Promise.allSettled([
      cancelPaidOrder(staff, orderNumber, { reason: "A" }),
      cancelPaidOrder(admin, orderNumber, { reason: "B" }),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await Refund.countDocuments()).toBe(1)
  })
})

describe("returns", () => {
  /** A delivered order of two cotton kurtis (a returnable ready-made item). */
  async function delivered(slug = "cotton-kurti", qty = 2) {
    const o = await paidOrder(slug, qty)
    const s = await createShipmentForOrder(staff, o.orderNumber)
    await applyTrackingEvent(s.awb, { status: "delivered", at: NOW })
    return o
  }

  it("never accepts fabric cut to length", async () => {
    const { userId, orderNumber, variant } = await delivered("handloom-cotton", 2500)
    await expect(
      requestReturn(
        userId,
        orderNumber,
        [{ variantId: String(variant._id), qty: 2500 }],
        "Wrong colour",
        at(60)
      )
    ).rejects.toThrow(/cut to your length/i)
  })

  it("accepts a ready-made item inside the window and refunds its price when received", async () => {
    const { userId, orderNumber, variant, order } = await delivered()
    const before = (await stockOf(variant._id)).onHand
    const req = await requestReturn(
      userId,
      orderNumber,
      [{ variantId: String(variant._id), qty: 1 }],
      "Too small",
      at(60)
    )
    expect(req.status).toBe("requested")
    await decideReturn(support, String(req._id), { approve: true })
    const done = await receiveReturn(admin, String(req._id))
    expect(done).toMatchObject({
      status: "refunded",
      refundAmountPaise: order.items[0]!.unitPricePaise,
    })
    expect((await stockOf(variant._id)).onHand).toBe(before + 1)
    expect((await reload(orderNumber))?.paymentStatus).toBe("partially_refunded")
    await expect(receiveReturn(admin, String(req._id))).rejects.toThrow()
  })

  it("refuses outside the window, too many, repeats, other people's orders and empty reasons", async () => {
    const { userId, orderNumber, variant } = await delivered()
    const item = [{ variantId: String(variant._id), qty: 1 }]
    await expect(
      requestReturn(userId, orderNumber, item, "Late", new Date(NOW.getTime() + 8 * 86_400_000))
    ).rejects.toThrow(/window/i)
    await expect(
      requestReturn(
        userId,
        orderNumber,
        [{ variantId: String(variant._id), qty: 3 }],
        "Too many",
        at(60)
      )
    ).rejects.toThrow(/at most/i)
    await expect(requestReturn(userId, orderNumber, item, "  ", at(60))).rejects.toThrow()
    await requestReturn(
      userId,
      orderNumber,
      [{ variantId: String(variant._id), qty: 2 }],
      "All of them",
      at(60)
    )
    await expect(requestReturn(userId, orderNumber, item, "Again", at(60))).rejects.toThrow(
      /already in a return/i
    )
    await expect(
      requestReturn(String(oid()), orderNumber, item, "Not mine", at(60))
    ).rejects.toThrow(/not find/i)
  })

  it("is not possible before delivery", async () => {
    const { userId, orderNumber, variant } = await paidOrder("cotton-kurti", 1)
    await expect(
      requestReturn(
        userId,
        orderNumber,
        [{ variantId: String(variant._id), qty: 1 }],
        "Early",
        at(60)
      )
    ).rejects.toThrow(/once the order has been delivered/i)
  })

  it("a refused return needs a reason for the customer and is final", async () => {
    const { userId, orderNumber, variant } = await delivered()
    const req = await requestReturn(
      userId,
      orderNumber,
      [{ variantId: String(variant._id), qty: 1 }],
      "Faulty",
      at(60)
    )
    await expect(
      decideReturn(support, String(req._id), { approve: false, note: " " })
    ).rejects.toThrow(/reason/i)
    await decideReturn(support, String(req._id), { approve: false, note: "Worn and washed" })
    await expect(decideReturn(support, String(req._id), { approve: true })).rejects.toThrow(
      /already been decided/i
    )
    await expect(receiveReturn(admin, String(req._id))).rejects.toThrow()
  })

  it("only staff with the returns permission can decide", async () => {
    const { userId, orderNumber, variant } = await delivered()
    const req = await requestReturn(
      userId,
      orderNumber,
      [{ variantId: String(variant._id), qty: 1 }],
      "Faulty",
      at(60)
    )
    await expect(
      decideReturn(customerActor(userId), String(req._id), { approve: true })
    ).rejects.toThrow()
  })
})
