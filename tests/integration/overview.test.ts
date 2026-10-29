import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import type { ROLES } from "@/config/permissions"
import { Address } from "@/models/address"
import { Order } from "@/models/order"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { User } from "@/models/user"
import {
  getAttention,
  getOverview,
  parseRange,
  startOfIndianDay,
} from "@/services/admin-dashboard-service"
import { addToCart } from "@/services/cart-service"
import { createCheckout, markPaymentCaptured } from "@/services/order-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => String(new mongoose.Types.ObjectId())
const owner = { id: oid(), role: "super_admin" as const }
let key = 0
const idem = () => `overview-key-${String(++key).padStart(8, "0")}-abcdefgh`

beforeAll(async () => {
  replSet = await startDatabase("overview_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
})

/** A paid order placed at `when`, by a customer who may have bought before. */
async function sale(
  when: Date,
  qty = 2500,
  buyer?: { userId: string; email: string; addressId: string }
) {
  const userId = buyer?.userId ?? oid()
  const email = buyer?.email ?? `${userId}@example.com`
  const address = buyer
    ? { _id: buyer.addressId }
    : await Address.create({
        userId,
        fullName: "Meera Shah",
        phone: "9876543210",
        line1: "1 Road",
        city: "Surat",
        state: "Gujarat",
        pincode: "395003",
      })
  const product = (await Product.findOne({ slug: "handloom-cotton" }).lean())!
  const variant = (await ProductVariant.findOne({ productId: product._id })
    .sort({ sku: 1 })
    .lean<ProductVariantDoc>())!
  await addToCart(userId, String(variant._id), qty)
  const s = await createCheckout({
    userId,
    email,
    addressId: String(address._id),
    idempotencyKey: idem(),
    now: when,
  })
  await markPaymentCaptured({
    gatewayOrderId: s.gatewayOrderId,
    paymentId: `pay_${idem()}`,
    amountPaise: s.amountPaise,
  })
  await Order.updateOne({ orderNumber: s.orderNumber }, { $set: { placedAt: when } })
  return { userId, email, addressId: String(address._id), amountPaise: s.amountPaise }
}

describe("the overview", () => {
  it("compares this period with the one before it, and fills every day of the chart", async () => {
    const day = 86_400_000
    await sale(new Date(NOW.getTime() - 2 * day)) // inside the last 7 days
    await sale(new Date(NOW.getTime() - 3 * day), 5000)
    await sale(new Date(NOW.getTime() - 10 * day)) // the 7 days before
    const o = await getOverview(owner, "7d", NOW)
    expect(o.kpis!.orders).toEqual({ value: 2, previous: 1 })
    expect(o.kpis!.revenuePaise.value).toBe(45000 + 8000 + (90000 + 8000))
    expect(o.kpis!.averageOrderPaise.value).toBe(Math.round(o.kpis!.revenuePaise.value / 2))
    expect(o.series).toHaveLength(7)
    expect(o.series!.at(-1)!.date).toBe("2026-10-14")
    expect(o.series!.reduce((n, p) => n + p.revenuePaise, 0)).toBe(o.kpis!.revenuePaise.value)
    expect(new Set(o.series!.map((p) => p.date)).size).toBe(7) // no repeated or skipped day
  })

  it("subtracts refunds from sales", async () => {
    await sale(new Date(NOW.getTime() - 3600_000))
    await Order.updateMany({}, { $set: { refundedPaise: 10000 } })
    expect((await getOverview(owner, "today", NOW)).kpis!.revenuePaise.value).toBe(
      45000 + 8000 - 10000
    )
  })

  it("lists top products and recent orders, newest first, with no addresses in them", async () => {
    await sale(new Date(NOW.getTime() - 3600_000))
    const o = await getOverview(owner, "30d", NOW)
    expect(o.top![0]).toMatchObject({ slug: "handloom-cotton", unitsText: "2.5 m" })
    expect(o.recentOrders).toHaveLength(1)
    expect(JSON.stringify(o)).not.toContain("1 Road")
  })

  it("sorts buyers into new, returning and loyal by how many orders they have made", async () => {
    const regular = await sale(new Date(NOW.getTime() - 3600_000))
    await sale(new Date(NOW.getTime() - 7200_000), 1000, regular) // second order
    const loyal = await sale(new Date(NOW.getTime() - 9000_000), 1000)
    await sale(new Date(NOW.getTime() - 9100_000), 1000, loyal)
    await sale(new Date(NOW.getTime() - 9200_000), 1000, loyal)
    await sale(new Date(NOW.getTime() - 9300_000)) // a first-time buyer
    expect((await getOverview(owner, "30d", NOW)).segments).toEqual({
      new: 1,
      returning: 1,
      loyal: 1,
    })
  })

  it("counts new customers by sign-up date", async () => {
    await User.create({
      email: "n1@example.com",
      name: "N One",
      createdAt: new Date(NOW.getTime() - 3600_000),
    })
    await User.create({
      email: "n2@example.com",
      name: "N Two",
      createdAt: new Date(NOW.getTime() - 40 * 86_400_000),
    })
    expect((await getOverview(owner, "7d", NOW)).kpis!.newCustomers).toEqual({
      value: 1,
      previous: 0,
    })
  })

  it("flags low and out-of-stock items", async () => {
    const o = await getOverview(owner, "30d", NOW)
    expect(o.stockAlerts!.length).toBeGreaterThan(0)
    expect(o.stockAlerts!.some((a) => a.out && a.availableText === "Out of stock")).toBe(true)
  })

  it("shows each role only the sections it may see", async () => {
    const keys = async (role: (typeof ROLES)[number]) =>
      Object.keys(await getOverview({ id: oid(), role }, "30d", NOW)).sort()
    expect(await keys("super_admin")).toEqual(
      [
        "attention",
        "from",
        "kpis",
        "range",
        "recentOrders",
        "segments",
        "series",
        "stockAlerts",
        "to",
        "top",
      ].sort()
    )
    expect(await keys("support")).toEqual(
      ["attention", "from", "range", "recentOrders", "stockAlerts", "to"].sort()
    ) // no money figures
    expect(await keys("catalog_manager")).toEqual(
      ["attention", "from", "range", "stockAlerts", "to"].sort()
    )
    expect(await keys("customer")).toEqual(["attention", "from", "range", "to"].sort())
    expect(
      Object.keys((await getOverview({ id: oid(), role: "support" }, "30d", NOW)).attention).sort()
    ).toEqual(["needsAttention", "returns", "reviews", "toShip"])
    expect(await getAttention({ id: oid(), role: "catalog_manager" })).toEqual({})
  })

  it("understands the period names and the Indian day", () => {
    expect(parseRange("7d")).toBe("7d")
    expect(parseRange("nonsense")).toBe("30d")
    expect(parseRange(undefined)).toBe("30d")
    // 6:00 UTC on 14 October is 11:30 in India, so the day began at 18:30 UTC the evening before.
    expect(startOfIndianDay(NOW).toISOString()).toBe("2026-10-13T18:30:00.000Z")
  })
})
