import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { ROLES, roleHasPermission } from "@/config/permissions"
import { ForbiddenError } from "@/lib/errors"
import { units } from "@/lib/measure"
import { Order, type OrderDoc } from "@/models/order"
import { Product } from "@/models/product"
import { ProductVariant } from "@/models/product-variant"
import { Refund } from "@/models/refund"
import {
  getReports,
  isReportKind,
  MAX_DAYS,
  parseReportRange,
  reportCsv,
  REPORT_KINDS,
} from "@/services/report-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
// 11:30 on 14 October 2026 in India.
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => new mongoose.Types.ObjectId()
const owner = { id: String(oid()), role: "super_admin" as const }
const U1 = oid()
const U2 = oid()
let n = 0

beforeAll(async () => {
  replSet = await startDatabase("reports_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
  n = 0
})

type Spec = {
  slug: string
  at: string
  user: mongoose.Types.ObjectId
  qty: number
  linePaise: number
  discountPaise?: number
  costLinePaise?: number
  shippingPaise?: number
  coupon?: string
  refundedPaise?: number
  status?: OrderDoc["status"]
  paymentStatus?: OrderDoc["paymentStatus"]
  fulfillmentStatus?: OrderDoc["fulfillmentStatus"]
  state?: string
  deliveredAt?: string
}

/** An order written straight to the database, with exact figures, so the reports can be checked by hand. */
async function order(s: Spec) {
  const product = (await Product.findOne({ slug: s.slug }).lean())!
  const variant = (await ProductVariant.findOne({ productId: product._id }).lean())!
  const paid = (s.paymentStatus ?? "paid") !== "unpaid"
  const at = new Date(s.at)
  const discount = s.discountPaise ?? 0
  const shipping = s.shippingPaise ?? 0
  return Order.create({
    orderNumber: `T-${String(++n).padStart(6, "0")}`,
    userId: s.user,
    email: "buyer@example.com",
    status: s.status ?? "confirmed",
    paymentStatus: s.paymentStatus ?? "paid",
    fulfillmentStatus: s.fulfillmentStatus ?? "unfulfilled",
    items: [
      {
        variantId: variant._id,
        productId: product._id,
        slug: product.slug,
        name: product.name,
        sku: variant.sku,
        unit: s.qty >= 100 ? units.perMetre() : units.each(),
        qty: s.qty,
        unitPricePaise: 20000,
        linePaise: s.linePaise,
        discountPaise: discount,
        returnable: true,
        weightGrams: 300,
        ...(s.costLinePaise !== undefined ? { costLinePaise: s.costLinePaise } : {}),
      },
    ],
    pricing: {
      subtotalPaise: s.linePaise,
      discountPaise: discount,
      shippingPaise: shipping,
      taxPaise: 0,
      taxExclusive: false,
      totalPaise: s.linePaise - discount + shipping,
    },
    ...(s.coupon ? { coupon: { couponId: oid(), code: s.coupon } } : {}),
    shippingAddress: {
      fullName: "A Buyer",
      phone: "9876543210",
      line1: "1 Road",
      city: "City",
      state: s.state ?? "Gujarat",
      pincode: "395003",
    },
    gateway: "mock",
    idempotencyKey: `report-key-${n}-abcdefghijklmnop`,
    reservationExpiresAt: new Date(at.getTime() + 3_600_000),
    refundedPaise: s.refundedPaise ?? 0,
    ...(paid ? { placedAt: at } : {}),
    ...(s.deliveredAt ? { deliveredAt: new Date(s.deliveredAt) } : {}),
    createdAt: at,
    updatedAt: at,
  })
}

/**
 * The shop's figures, worked out by hand:
 *   A  14 Oct 09:00  cotton cloth 2.5 m      Rs 500 + Rs 80 shipping = Rs 580, delivered, no cost recorded
 *   B  13 Oct 23:45  bandhani dupatta        Rs 1,200 - Rs 120 coupon = Rs 1,080, Rs 200 refunded, cost Rs 600
 *   C  13 Oct 00:10  ajrakh dupatta          Rs 900 = Rs 900, no cost recorded (belongs to the 13th in India)
 *   E   1 Sep       (the period before)      Rs 400, by the same person as A and C
 */
async function fixtures() {
  await order({
    slug: "handloom-cotton",
    at: "2026-10-14T03:30:00Z",
    user: U1,
    qty: 2500,
    linePaise: 50000,
    shippingPaise: 8000,
    fulfillmentStatus: "delivered",
    deliveredAt: "2026-10-14T04:00:00Z",
    state: "Gujarat",
  })
  const b = await order({
    slug: "bandhani-dupatta",
    at: "2026-10-13T18:15:00Z",
    user: U2,
    qty: 1,
    linePaise: 120000,
    discountPaise: 12000,
    costLinePaise: 60000,
    coupon: "WELCOME10",
    refundedPaise: 20000,
    paymentStatus: "partially_refunded",
    state: "Maharashtra",
  })
  await order({
    slug: "ajrakh-dupatta",
    at: "2026-10-12T18:40:00Z",
    user: U1,
    qty: 1,
    linePaise: 90000,
    state: "Gujarat",
  })
  await order({
    slug: "handloom-cotton",
    at: "2026-09-01T06:00:00Z",
    user: U1,
    qty: 2000,
    linePaise: 40000,
  })
  // Orders that were started but not paid, in the period.
  await order({
    slug: "handloom-cotton",
    at: "2026-10-14T01:00:00Z",
    user: U2,
    qty: 1,
    linePaise: 1000,
    status: "pending_payment",
    paymentStatus: "unpaid",
  })
  await order({
    slug: "handloom-cotton",
    at: "2026-10-12T01:00:00Z",
    user: U2,
    qty: 1,
    linePaise: 1000,
    status: "expired",
    paymentStatus: "unpaid",
  })
  await order({
    slug: "handloom-cotton",
    at: "2026-10-11T01:00:00Z",
    user: U2,
    qty: 1,
    linePaise: 1000,
    status: "cancelled",
    paymentStatus: "unpaid",
  })
  await Refund.create({
    orderId: b._id,
    paymentId: oid(),
    amountPaise: 20000,
    status: "processed",
    reason: "Damaged",
    idempotencyKey: "refund-key-1",
    createdAt: new Date("2026-10-13T20:00:00Z"),
  })
  // A refund that was never processed does not count as money returned.
  await Refund.create({
    orderId: b._id,
    paymentId: oid(),
    amountPaise: 5000,
    status: "failed",
    reason: "Failed",
    idempotencyKey: "refund-key-2",
    createdAt: new Date("2026-10-13T20:00:00Z"),
  })
}

describe("choosing the period", () => {
  it("defaults to the last 30 days, ending today in India", () => {
    const r = parseReportRange({}, NOW)
    expect([r.from, r.to, r.days, r.adjusted]).toEqual(["2026-09-15", "2026-10-14", 30, undefined])
    expect(r.start.toISOString()).toBe("2026-09-14T18:30:00.000Z") // midnight in India
    expect(r.end.toISOString()).toBe("2026-10-14T18:30:00.000Z")
  })

  it("uses the dates asked for, and cuts the day at midnight India time", () => {
    const r = parseReportRange({ from: "2026-10-01", to: "2026-10-07" }, NOW)
    expect([r.days, r.adjusted]).toEqual([7, undefined])
    expect(r.start.toISOString()).toBe("2026-09-30T18:30:00.000Z")
  })

  it("explains when it changes what was asked for", () => {
    expect(parseReportRange({ from: "nope", to: "2026-10-07" }, NOW).adjusted).toMatch(
      /not understood/
    )
    expect(parseReportRange({ from: "2026-02-31", to: "2026-10-07" }, NOW).adjusted).toMatch(
      /not understood/
    )
    expect(parseReportRange({ from: "2026-10-01" }, NOW).adjusted).toMatch(/not understood/)
    const future = parseReportRange({ from: "2026-10-10", to: "2027-01-01" }, NOW)
    expect([future.to, future.adjusted]).toEqual(["2026-10-14", expect.stringMatching(/future/)])
    const flipped = parseReportRange({ from: "2026-10-10", to: "2026-10-05" }, NOW)
    expect([flipped.from, flipped.to, flipped.days]).toEqual(["2026-10-05", "2026-10-05", 1])
    const long = parseReportRange({ from: "2020-01-01", to: "2026-10-14" }, NOW)
    expect(long.days).toBe(MAX_DAYS)
    expect(long.adjusted).toMatch(/at most 366 days/)
  })
})

describe("the figures", () => {
  it("sums sales, discounts, shipping, refunds and net, and compares with the period before", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.summary.orders).toEqual({ value: 3, previous: 1 })
    expect(r.summary.itemSalesPaise).toEqual({ value: 260000, previous: 40000 })
    expect(r.summary.discountPaise).toEqual({ value: 12000, previous: 0 })
    expect(r.summary.shippingPaise).toEqual({ value: 8000, previous: 0 })
    expect(r.summary.refundedPaise).toEqual({ value: 20000, previous: 0 })
    // 580 + (1,080 - 200) + 900 = Rs 2,360
    expect(r.summary.netPaise).toEqual({ value: 236000, previous: 40000 })
    expect(r.summary.averageOrderPaise).toEqual({ value: 78667, previous: 40000 })
  })

  it("estimates profit only from lines with a recorded cost, and says how much that covers", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    // Only the dupatta has a cost: Rs 1,080 - Rs 600. It is 108,000 of 248,000 paise of item sales.
    expect(r.summary.profit).toEqual({ value: { value: 48000, previous: 0 }, coveredPct: 44 })
  })

  it("lists every day, with the right orders on the right day in India", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.daily).toHaveLength(30)
    expect(r.daily[0]).toEqual({ date: "2026-09-15", orders: 0, netPaise: 0 })
    expect(r.daily.at(-1)).toEqual({ date: "2026-10-14", orders: 1, netPaise: 58000 })
    // 23:45 on the 13th and 00:10 on the 13th are both the 13th; neither belongs to the 12th or 14th.
    expect(r.daily.find((d) => d.date === "2026-10-13")).toEqual({
      date: "2026-10-13",
      orders: 2,
      netPaise: 88000 + 90000,
    })
    expect(r.daily.find((d) => d.date === "2026-10-12")?.orders).toBe(0)
    expect(r.daily.reduce((s, d) => s + d.netPaise, 0)).toBe(r.summary.netPaise.value)
  })

  it("a one-day report holds only that day", async () => {
    await fixtures()
    const r = await getReports(
      owner,
      parseReportRange({ from: "2026-10-13", to: "2026-10-13" }, NOW)
    )
    expect([r.summary.orders.value, r.summary.netPaise.value]).toEqual([2, 178000])
    expect(r.summary.orders.previous).toBe(0) // the 12th
  })

  it("splits sales by product, category, fabric and print, each adding up to the item sales", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.products.map((p) => [p.name, p.salesPaise, p.quantityText])).toEqual([
      ["Bandhani dupatta", 108000, "1 piece"],
      ["Ajrakh dupatta", 90000, "1 piece"],
      ["Handloom cotton", 50000, "2.5 m"],
    ])
    const total = 248000 // item sales after discount
    for (const list of [r.categories, r.fabrics, r.prints])
      expect(list.reduce((s, b) => s + b.salesPaise, 0)).toBe(total)
    expect(r.categories.map((c) => [c.name, c.salesPaise])).toEqual([
      ["Dupattas / Bandhani", 108000],
      ["Dupattas / Ajrakh", 90000],
      ["Fabrics / Cotton", 50000],
    ])
    expect(r.fabrics.map((f) => [f.name, f.salesPaise])).toEqual([
      ["Gaji silk", 108000],
      ["Modal silk", 90000],
      ["Cotton", 50000],
    ])
    expect(r.prints.map((p) => [p.name, p.salesPaise])).toEqual([
      ["Bandhani", 108000],
      ["Ajrakh", 90000],
      ["No print or plain", 50000],
    ])
  })

  it("groups by where orders are going, and by coupon", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.states).toEqual([
      { state: "Gujarat", orders: 2, netPaise: 58000 + 90000 },
      { state: "Maharashtra", orders: 1, netPaise: 88000 },
    ])
    expect(r.coupons).toEqual([
      { code: "WELCOME10", orders: 1, discountPaise: 12000, netPaise: 88000 },
    ])
  })

  it("follows orders from started to paid, and where the others ended", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.checkout).toEqual({
      started: 6,
      paid: 3,
      awaitingPayment: 1,
      failed: 0,
      expired: 1,
      cancelled: 1,
      other: 0,
    })
  })

  it("counts new and returning buyers by earlier orders, not just this period", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    // Bought in the period: U1 (also bought on 1 Sep, so returning) and U2 (first time).
    expect(r.customers).toEqual({ buyers: 2, returning: 1, first: 1 })
  })

  it("counts deliveries, orders still on their way, and refunds that really went out", async () => {
    await fixtures()
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.aftercare).toEqual({
      delivered: 1,
      returnRequests: 0,
      refundCount: 1,
      refundsPaise: 20000,
      undelivered: 2,
    })
  })

  it("is all zeros, not an error, when nothing was sold", async () => {
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.summary.orders).toEqual({ value: 0, previous: 0 })
    expect(r.summary.averageOrderPaise).toEqual({ value: 0, previous: 0 })
    expect(r.summary.profit).toEqual({ value: { value: 0, previous: 0 }, coveredPct: 100 })
    expect([r.products, r.categories, r.states, r.coupons]).toEqual([[], [], [], []])
    expect(r.daily).toHaveLength(30)
  })

  it("does not count an unpaid or never-paid order as a sale", async () => {
    await order({
      slug: "handloom-cotton",
      at: "2026-10-14T01:00:00Z",
      user: U1,
      qty: 1,
      linePaise: 99900,
      status: "pending_payment",
      paymentStatus: "unpaid",
    })
    const r = await getReports(owner, parseReportRange({}, NOW))
    expect(r.summary.orders.value).toBe(0)
    expect(r.checkout.started).toBe(1)
  })
})

describe("who sees what", () => {
  it("shows profit only to those who may see costs, and customers only to those who may see customers", async () => {
    await fixtures()
    const range = parseReportRange({}, NOW)
    for (const role of ROLES) {
      const actor = { id: String(oid()), role }
      if (!roleHasPermission(role, "analytics:read")) {
        await expect(getReports(actor, range), role).rejects.toBeInstanceOf(ForbiddenError)
        continue
      }
      const r = await getReports(actor, range)
      expect(r.summary.profit !== undefined, `${role} profit`).toBe(
        roleHasPermission(role, "costs:read")
      )
      expect(r.customers !== undefined, `${role} customers`).toBe(
        roleHasPermission(role, "customers:read")
      )
      expect(
        r.products.some((p) => p.profitPaise !== undefined),
        `${role} product profit`
      ).toBe(roleHasPermission(role, "costs:read"))
      expect(JSON.stringify(r).includes("costLine"), role).toBe(false)
    }
  })
})

describe("spreadsheets", () => {
  it("has one for every report, with the same figures", async () => {
    await fixtures()
    const range = parseReportRange({}, NOW)
    for (const kind of REPORT_KINDS) {
      const { filename, csv } = await reportCsv(owner, kind, range)
      expect(filename).toBe(`ambar-${kind}-2026-09-15-to-2026-10-14.csv`)
      expect(csv.endsWith("\n")).toBe(true)
      expect(csv.split("\n").length).toBeGreaterThan(1)
    }
    const daily = (await reportCsv(owner, "daily", range)).csv.split("\n")
    expect(daily[0]).toBe("Date,Orders,Net sales (Rs)")
    expect(daily).toContain("2026-10-13,2,1780.00")
    const fabrics = (await reportCsv(owner, "fabrics", range)).csv.split("\n")
    expect(fabrics[0]).toBe("Fabric,Order lines,Item sales (Rs),Profit (Rs)")
    expect(fabrics).toContain("Gaji silk,1,1080.00,480.00")
    const coupons = (await reportCsv(owner, "coupons", range)).csv
    expect(coupons).toContain("WELCOME10,1,120.00,880.00")
  })

  it("leaves profit out of a spreadsheet for someone who may not see costs", async () => {
    await fixtures()
    const csv = (
      await reportCsv(
        { id: String(oid()), role: "fulfillment_manager" },
        "products",
        parseReportRange({}, NOW)
      )
    ).csv
    expect(csv.split("\n")[0]).toBe("Product,Quantity sold,Order lines,Item sales (Rs)")
  })

  it("will not hand a formula to the spreadsheet program", async () => {
    await order({
      slug: "handloom-cotton",
      at: "2026-10-14T03:30:00Z",
      user: U1,
      qty: 1,
      linePaise: 1000,
      state: '=HYPERLINK("http://evil")',
    })
    const { csv } = await reportCsv(owner, "states", parseReportRange({}, NOW))
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).not.toMatch(/^=/m)
  })

  it("refuses without permission", async () => {
    await expect(
      reportCsv({ id: String(oid()), role: "support" }, "daily", parseReportRange({}, NOW))
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("knows which report names are real", () => {
    expect(isReportKind("daily")).toBe(true)
    expect(isReportKind("everything")).toBe(false)
    expect(isReportKind(null)).toBe(false)
    expect(isReportKind("__proto__")).toBe(false)
  })
})

describe("quick choices and empty periods", () => {
  it("works out the quick choices in India time", async () => {
    const { reportPresets } = await import("@/services/report-service")
    const p = Object.fromEntries(reportPresets(NOW).map((x) => [x.label, [x.from, x.to]]))
    expect(p["Last 7 days"]).toEqual(["2026-10-08", "2026-10-14"])
    expect(p["Last 30 days"]).toEqual(["2026-09-15", "2026-10-14"])
    expect(p["This month"]).toEqual(["2026-10-01", "2026-10-14"])
    expect(p["Last month"]).toEqual(["2026-09-01", "2026-09-30"])
    expect(p["This financial year"]).toEqual(["2026-04-01", "2026-10-14"])
    // January looks back to December of the year before; the financial year then began the April before.
    const jan = Object.fromEntries(
      reportPresets(new Date("2027-01-10T06:00:00Z")).map((x) => [x.label, [x.from, x.to]])
    )
    expect(jan["Last month"]).toEqual(["2026-12-01", "2026-12-31"])
    expect(jan["This financial year"]).toEqual(["2026-04-01", "2027-01-10"])
    // Just after midnight in India it is already tomorrow there.
    const late = reportPresets(new Date("2026-10-14T19:00:00Z"))
    expect(late.find((x) => x.label === "Last 7 days")?.to).toBe("2026-10-15")
  })

  it("keeps the same columns for someone who may see profit, even when nothing sold", async () => {
    const range = parseReportRange({}, NOW)
    expect((await reportCsv(owner, "fabrics", range)).csv.split("\n")[0]).toBe(
      "Fabric,Order lines,Item sales (Rs),Profit (Rs)"
    )
    expect(
      (
        await reportCsv({ id: String(oid()), role: "fulfillment_manager" }, "fabrics", range)
      ).csv.split("\n")[0]
    ).toBe("Fabric,Order lines,Item sales (Rs)")
  })
})
