import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors"
import { WALK_IN_EMAIL } from "@/lib/walk-in"
import { InventoryMovement } from "@/models/inventory-movement"
import { InventoryReservation } from "@/models/inventory-reservation"
import { Job } from "@/models/job"
import { Order } from "@/models/order"
import { Payment } from "@/models/payment"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { User } from "@/models/user"
import { getAttention, getOverview } from "@/services/admin-dashboard-service"
import { listCustomers } from "@/services/admin-ops-service"
import { getInvoiceForStaff } from "@/services/invoice-service"
import { listOrdersForStaff } from "@/services/order-detail-service"
import {
  createOfflineOrder,
  previewOfflineOrder,
  searchSellable,
  voidOfflineOrder,
} from "@/services/offline-order-service"
import { getReports, parseReportRange } from "@/services/report-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date()
const oid = () => String(new mongoose.Types.ObjectId())
const owner = { id: oid(), role: "super_admin" as const }
const admin = { id: oid(), role: "admin" as const }
const support = { id: oid(), role: "support" as const }
const manager = { id: oid(), role: "fulfillment_manager" as const }
let counter = 0
const key = () => `shop-sale-${String(++counter).padStart(8, "0")}-abcdefgh`

let cloth: ProductVariantDoc // sold by length, 450 per metre, cost 300 per metre
let piece: ProductVariantDoc // sold by piece

beforeAll(async () => {
  replSet = await startDatabase("offline_orders_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
  const all = await ProductVariant.find({ status: "active" }).lean<ProductVariantDoc[]>()
  const length = all.find((v) => v.sellingUnit.kind === "length")!
  const single = all.find((v) => v.sellingUnit.kind === "piece")!
  await ProductVariant.updateOne(
    { _id: length._id },
    {
      $set: { pricePaise: 45000, costPaise: 30000, "stock.onHand": 10_000, "stock.reserved": 0 },
      $unset: { salePricePaise: "", compareAtPaise: "" },
    }
  )
  await ProductVariant.updateOne(
    { _id: single._id },
    {
      $set: { pricePaise: 120000, costPaise: 80000, "stock.onHand": 5, "stock.reserved": 0 },
      $unset: { salePricePaise: "", compareAtPaise: "" },
    }
  )
  cloth = (await ProductVariant.findById(length._id).lean<ProductVariantDoc>())!
  piece = (await ProductVariant.findById(single._id).lean<ProductVariantDoc>())!
})

const stock = async (v: ProductVariantDoc) =>
  (await ProductVariant.findById(v._id).lean<ProductVariantDoc>())!.stock
const sale = (extra: Partial<Parameters<typeof createOfflineOrder>[1]> = {}) =>
  createOfflineOrder(admin, {
    lines: [{ variantId: String(cloth._id), qty: cloth.sellingUnit.minQty * 5 }],
    method: "cash",
    idempotencyKey: key(),
    ...extra,
  })
// 2.5 m or the nearest valid quantity on the cloth's grid.
const oneMetreAndAHalf = () => cloth.sellingUnit.minQty * 3

describe("recording a sale made in the shop", () => {
  it("creates a paid, handed-over order and takes the stock off at once", async () => {
    const qty = oneMetreAndAHalf()
    const before = await stock(cloth)
    const done = await sale({
      lines: [
        { variantId: String(cloth._id), qty },
        { variantId: String(piece._id), qty: piece.sellingUnit.minQty },
      ],
      customer: { name: "Meera", phone: "98765 43210" },
      method: "upi",
    })
    const order = (await Order.findOne({ orderNumber: done.orderNumber }).lean())!
    expect(order).toMatchObject({
      status: "completed",
      paymentStatus: "paid",
      fulfillmentStatus: "delivered",
      channel: "store",
      paymentMethod: "upi",
      gateway: "store",
      email: WALK_IN_EMAIL,
    })
    expect(order.placedAt).toBeInstanceOf(Date)
    expect(order.shippingAddress).toMatchObject({ fullName: "Meera", phone: "+919876543210" })
    expect(order.pricing.shippingPaise).toBe(0)
    expect(String(order.soldBy)).toBe(admin.id)
    expect(order.items).toHaveLength(2)
    expect(order.items.every((i) => !i.returnable)).toBe(true)
    // What it cost the shop is kept per line, so profit works.
    expect(order.items[0]!.costLinePaise).toBe(
      Math.round((30000 * qty) / cloth.sellingUnit.pricePerBaseUnits)
    )

    const after = await stock(cloth)
    expect(after.onHand).toBe(before.onHand - qty)
    expect(after.reserved).toBe(0)
    expect((await stock(piece)).onHand).toBe(5 - piece.sellingUnit.minQty)
    const movements = await InventoryMovement.find({ orderId: order._id }).lean()
    expect(movements.some((m) => m.type === "commit")).toBe(true)
    expect((await InventoryReservation.findOne({ orderId: order._id }).lean())!.status).toBe(
      "committed"
    )

    const payment = (await Payment.findOne({ orderId: order._id }).lean())!
    expect(payment).toMatchObject({ gateway: "store", method: "upi", status: "captured" })
    expect(payment.amountPaise).toBe(order.pricing.totalPaise)

    // A numbered bill is ready, without a delivery address.
    const invoice = await getInvoiceForStaff(admin, done.orderNumber)
    expect(invoice.number).toMatch(/^INV\/\d{4}-\d{2}\/000001$/)
    expect(invoice.inStore).toBe(true)
    expect(invoice.buyer.lines).toEqual([])
    expect(invoice.buyer.email).toBe("")
    expect(invoice.payment).toBe("Paid in the shop by UPI")
    // Nothing is emailed.
    expect(await Job.countDocuments({ type: "email" })).toBe(0)
  })

  it("uses today's shop price and the same rounding as the website", async () => {
    const preview = await previewOfflineOrder(admin, [
      { variantId: String(cloth._id), qty: cloth.sellingUnit.minQty * 5 },
    ])
    const expected = Math.round(
      (45000 * cloth.sellingUnit.minQty * 5) / cloth.sellingUnit.pricePerBaseUnits
    )
    expect(preview.subtotalPaise).toBe(expected)
    expect(preview.totalPaise).toBe(expected)
  })

  it("merges the same item added twice", async () => {
    const q = cloth.sellingUnit.minQty
    const done = await sale({
      lines: [
        { variantId: String(cloth._id), qty: q },
        { variantId: String(cloth._id), qty: q * 2 },
      ],
    })
    const order = (await Order.findOne({ orderNumber: done.orderNumber }).lean())!
    expect(order.items).toHaveLength(1)
    expect(order.items[0]!.qty).toBe(q * 3)
  })

  it("sending the same sale twice makes one order and one deduction", async () => {
    const idempotencyKey = key()
    const before = (await stock(cloth)).onHand
    const [a, b] = await Promise.all([sale({ idempotencyKey }), sale({ idempotencyKey })])
    expect(a.orderNumber).toBe(b.orderNumber)
    expect(await Order.countDocuments({ channel: "store" })).toBe(1)
    expect((await stock(cloth)).onHand).toBe(before - cloth.sellingUnit.minQty * 5)
    await sale({ idempotencyKey })
    expect(await Order.countDocuments({ channel: "store" })).toBe(1)
  })

  it("refuses more than is in stock and changes nothing", async () => {
    const before = await stock(piece)
    await expect(
      sale({ lines: [{ variantId: String(piece._id), qty: 6 }] })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(await stock(piece)).toEqual(before)
    expect(await Order.countDocuments({})).toBe(0)
    expect(await InventoryReservation.countDocuments({ status: "active" })).toBe(0)
  })

  it("refuses a length that does not fit the cloth's steps, and nothing at all", async () => {
    await expect(
      sale({ lines: [{ variantId: String(cloth._id), qty: cloth.sellingUnit.minQty + 1 }] })
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(sale({ lines: [] })).rejects.toBeInstanceOf(ValidationError)
    await expect(sale({ idempotencyKey: "short" })).rejects.toBeInstanceOf(ValidationError)
  })

  it("rejects a bad phone number but accepts a blank one", async () => {
    await expect(sale({ customer: { name: "A", phone: "12345" } })).rejects.toBeInstanceOf(
      ValidationError
    )
    const done = await sale({ customer: { name: "", phone: "" } })
    const order = (await Order.findOne({ orderNumber: done.orderNumber }).lean())!
    expect(order.shippingAddress.fullName).toBe("Walk-in customer")
    expect(order.shippingAddress.phone).toBe("")
  })
})

describe("discounts", () => {
  const total = async (discount?: Parameters<typeof previewOfflineOrder>[2]) =>
    await previewOfflineOrder(admin, [{ variantId: String(piece._id), qty: 1 }], discount)
  it("takes rupees or a percentage off the whole bill and keeps the reason", async () => {
    expect((await total()).totalPaise).toBe(120000)
    expect(
      (await total({ kind: "amount", value: 20000, reason: "Regular customer" })).totalPaise
    ).toBe(100000)
    expect((await total({ kind: "percent", value: 10, reason: "Festival" })).totalPaise).toBe(
      108000
    )
    const done = await sale({
      lines: [{ variantId: String(piece._id), qty: 1 }],
      discount: { kind: "percent", value: 10, reason: "Festival" },
    })
    const order = (await Order.findOne({ orderNumber: done.orderNumber }).lean())!
    expect(order.pricing).toMatchObject({
      subtotalPaise: 120000,
      discountPaise: 12000,
      totalPaise: 108000,
    })
    expect(order.discountReason).toBe("Festival")
    expect(order.items[0]!.discountPaise).toBe(12000)
  })

  it("needs a reason, stays within the bill, and the total stays at least one rupee", async () => {
    await expect(total({ kind: "amount", value: 100, reason: " " })).rejects.toBeInstanceOf(
      ValidationError
    )
    await expect(
      total({ kind: "amount", value: 120001, reason: "Too much" })
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(total({ kind: "amount", value: 120000, reason: "Free" })).rejects.toBeInstanceOf(
      ValidationError
    )
    await expect(total({ kind: "percent", value: 101, reason: "Too much" })).rejects.toBeInstanceOf(
      ValidationError
    )
    await expect(total({ kind: "percent", value: 0, reason: "Nothing" })).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it("is written to the audit log", async () => {
    const { AuditLog } = await import("@/models/audit-log")
    const done = await sale({
      lines: [{ variantId: String(piece._id), qty: 1 }],
      discount: { kind: "amount", value: 5000, reason: "Damaged edge" },
      method: "card",
    })
    const entry = (await AuditLog.findOne({ action: "order.store_sale" }).lean())!
    expect(entry.details).toMatchObject({
      orderNumber: done.orderNumber,
      method: "card",
      discountPaise: 5000,
      discountReason: "Damaged edge",
    })
  })
})

describe("voiding a sale", () => {
  it("puts the stock back, cancels the order, and works once", async () => {
    const before = (await stock(cloth)).onHand
    const done = await sale()
    await expect(voidOfflineOrder(admin, done.orderNumber, "")).rejects.toBeInstanceOf(
      ValidationError
    )
    await voidOfflineOrder(admin, done.orderNumber, "Wrong item")
    expect((await stock(cloth)).onHand).toBe(before)
    const order = (await Order.findOne({ orderNumber: done.orderNumber }).lean())!
    expect(order).toMatchObject({
      status: "cancelled",
      paymentStatus: "refunded",
      cancelReason: "Wrong item",
    })
    expect(order.refundedPaise).toBe(order.pricing.totalPaise)
    await expect(voidOfflineOrder(admin, done.orderNumber, "Again")).rejects.toBeInstanceOf(
      ValidationError
    )
    expect((await stock(cloth)).onHand).toBe(before)
  })

  it("refuses an online order", async () => {
    const done = await sale()
    await Order.updateOne({ orderNumber: done.orderNumber }, { $unset: { channel: "" } })
    await expect(voidOfflineOrder(admin, done.orderNumber, "Mistake")).rejects.toBeInstanceOf(
      NotFoundError
    )
  })
})

describe("who may do it", () => {
  it("only an owner or admin", async () => {
    for (const who of [support, manager]) {
      await expect(searchSellable(who, "silk")).rejects.toBeInstanceOf(ForbiddenError)
      await expect(
        createOfflineOrder(who, {
          lines: [{ variantId: String(piece._id), qty: 1 }],
          method: "cash",
          idempotencyKey: key(),
        })
      ).rejects.toBeInstanceOf(ForbiddenError)
    }
    const done = await createOfflineOrder(owner, {
      lines: [{ variantId: String(piece._id), qty: 1 }],
      method: "cash",
      idempotencyKey: key(),
    })
    await expect(voidOfflineOrder(support, done.orderNumber, "Mistake")).rejects.toBeInstanceOf(
      ForbiddenError
    )
  })

  it("finds items by name or code, and shows sold-out ones as unavailable", async () => {
    const found = await searchSellable(admin, cloth.sku)
    const row = found.find((r) => r.variantId === String(cloth._id))!
    expect(row.pricePaise).toBe(45000)
    expect(row.maxOrderable).toBeGreaterThan(0)
    await ProductVariant.updateOne({ _id: piece._id }, { $set: { "stock.onHand": 0 } })
    const soldOut = (await searchSellable(admin, piece.sku)).find(
      (r) => r.variantId === String(piece._id)
    )!
    expect(soldOut.maxOrderable).toBe(0)
    expect(soldOut.stockText).toBe("Sold out")
    expect(await searchSellable(admin, "a")).toEqual([])
    // Search text is plain text, not a pattern.
    expect(await searchSellable(admin, ".*")).toEqual([])
  })
})

describe("how store sales show up elsewhere", () => {
  it("keeps the walk-in account out of customers and new-customer counts", async () => {
    await sale()
    expect(await User.countDocuments({ email: WALK_IN_EMAIL })).toBe(1)
    const customers = await listCustomers(admin)
    expect(customers.some((c) => c.email === WALK_IN_EMAIL)).toBe(false)
    const overview = await getOverview(owner, "30d", NOW)
    expect(overview.kpis?.newCustomers?.value).toBe(0)
  })

  it("cannot be signed in to or claimed by registering its address", async () => {
    await sale()
    const user = (await User.findOne({ email: WALK_IN_EMAIL }).select("+passwordHash").lean())!
    expect(user.status).toBe("suspended")
    expect(user.passwordHash).toBeUndefined()
    const { registerUser } = await import("@/services/auth-service")
    await registerUser({
      name: "Squatter",
      email: WALK_IN_EMAIL,
      password: "Correct-Horse-9-Battery",
    })
    const after = (await User.findOne({ email: WALK_IN_EMAIL }).select("+passwordHash").lean())!
    expect(after.name).toBe("Walk-in customer")
    expect(after.passwordHash).toBeUndefined()
  })

  it("is not an order to ship, and is filterable in the orders list", async () => {
    await sale()
    expect((await getAttention(admin)).toShip).toBe(0)
    const list = await listOrdersForStaff(admin, "in_store")
    expect(list.rows).toHaveLength(1)
    expect(list.rows[0]!.channel).toBe("store")
    expect((await listOrdersForStaff(admin, "to_ship")).rows).toHaveLength(0)
  })

  it("counts as a sale with profit, but not as a checkout or a buyer", async () => {
    const done = await sale({ lines: [{ variantId: String(piece._id), qty: 1 }] })
    const r = await getReports(owner, parseReportRange({}, new Date()))
    expect(r.summary.orders.value).toBe(1)
    expect(r.summary.netPaise.value).toBe(120000)
    expect(r.summary.profit?.value.value).toBe(40000)
    expect(r.channels).toEqual([
      { channel: "online", orders: 0, netPaise: 0 },
      { channel: "store", orders: 1, netPaise: 120000 },
    ])
    expect(r.checkout.started).toBe(0)
    expect(r.customers?.buyers).toBe(0)
    expect(r.states.map((s) => s.state)).toContain("In store")
    await voidOfflineOrder(admin, done.orderNumber, "Mistake")
    const after = await getReports(owner, parseReportRange({}, new Date()))
    expect(after.summary.netPaise.value).toBe(0)
  })
})
