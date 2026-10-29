import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { toCsv } from "@/lib/csv"
import { formatQuantity, type SellingUnit } from "@/lib/measure"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { roleHasPermission } from "@/config/permissions"
import { Category } from "@/models/category"
import { Order } from "@/models/order"
import { Product } from "@/models/product"
import { Refund } from "@/models/refund"
import { ReturnRequest } from "@/models/return-request"
import { Taxon } from "@/models/taxon"
import { startOfIndianDay } from "@/services/admin-dashboard-service"

/**
 * Admin reports. Every figure is defined in docs/analytics.md and the definitions below match it:
 *  - A "counted order" is one that was paid (payment status paid, partially refunded or refunded),
 *    placed in the period, with days cut at midnight India time.
 *  - "Net sales" is what was paid minus what was refunded (shipping and tax included).
 *  - "Item sales" is the lines' prices less their share of any discount (shipping and tax excluded).
 *  - Category, fabric and print are the product's current ones, not those on the day it was sold.
 *  - Profit counts only lines whose cost was recorded, and says how much of the sales that covers.
 */
const trusted = mongoose.trusted
const DAY = 86_400_000
const IST = 5.5 * 3600 * 1000
export const MAX_DAYS = 366
const PAID = ["paid", "partially_refunded", "refunded"]

export type ReportRange = {
  /** First and last day included, as YYYY-MM-DD in India. */
  from: string
  to: string
  start: Date
  /** The instant the day after `to` begins. */
  end: Date
  days: number
  /** Set when what was asked for was changed (bad dates, too long a period, in the future). */
  adjusted?: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const istDate = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10)
const istMidnight = (date: string) => new Date(`${date}T00:00:00+05:30`)
const valid = (s: string | undefined): s is string =>
  Boolean(
    s && DATE.test(s) && !Number.isNaN(istMidnight(s).getTime()) && istDate(istMidnight(s)) === s
  )

export function parseReportRange(
  params: { from?: string; to?: string },
  now = new Date()
): ReportRange {
  const today = istDate(startOfIndianDay(now))
  const build = (from: string, to: string, adjusted?: string): ReportRange => {
    const start = istMidnight(from)
    const end = new Date(istMidnight(to).getTime() + DAY)
    return {
      from,
      to,
      start,
      end,
      days: Math.round((end.getTime() - start.getTime()) / DAY),
      adjusted,
    }
  }
  const last30 = () => istDate(new Date(startOfIndianDay(now).getTime() - 29 * DAY))
  if (!params.from && !params.to) return build(last30(), today)
  if (!valid(params.from) || !valid(params.to))
    return build(last30(), today, "Those dates were not understood, so the last 30 days are shown.")
  let { from, to } = params
  let adjusted: string | undefined
  if (to > today) {
    to = today
    adjusted = "The end date was in the future, so it was moved to today."
  }
  if (from > to) {
    from = to
    adjusted = "The start date was after the end date, so one day is shown."
  }
  if ((istMidnight(to).getTime() - istMidnight(from).getTime()) / DAY + 1 > MAX_DAYS) {
    from = istDate(new Date(istMidnight(to).getTime() - (MAX_DAYS - 1) * DAY))
    adjusted = `A report covers at most ${MAX_DAYS} days, so the start was moved to ${from}.`
  }
  return build(from, to, adjusted)
}

export type Compared = { value: number; previous: number }
export type Bucket = {
  key: string
  name: string
  /** Order lines sold (one line is one product and option on one order). */
  lines: number
  /** Item sales in paise. */
  salesPaise: number
  profitPaise?: number
}

export type Reports = {
  range: ReportRange
  summary: {
    orders: Compared
    itemSalesPaise: Compared
    discountPaise: Compared
    shippingPaise: Compared
    taxPaise: Compared
    refundedPaise: Compared
    netPaise: Compared
    averageOrderPaise: Compared
    profit?: { value: Compared; coveredPct: number }
  }
  daily: { date: string; orders: number; netPaise: number }[]
  products: (Bucket & { slug: string; quantityText: string })[]
  categories: Bucket[]
  fabrics: Bucket[]
  prints: Bucket[]
  states: { state: string; orders: number; netPaise: number }[]
  /** Sales online and sales made in the shop. */
  channels: { channel: "online" | "store"; orders: number; netPaise: number }[]
  coupons: { code: string; orders: number; discountPaise: number; netPaise: number }[]
  checkout: {
    started: number
    paid: number
    awaitingPayment: number
    failed: number
    expired: number
    cancelled: number
    other: number
  }
  customers?: { buyers: number; first: number; returning: number }
  aftercare: {
    delivered: number
    returnRequests: number
    refundsPaise: number
    refundCount: number
    undelivered: number
  }
}

type Row = Record<string, unknown>

const net = { $subtract: ["$pricing.totalPaise", "$refundedPaise"] }
const lineNet = { $subtract: ["$items.linePaise", "$items.discountPaise"] }
const counted = (from: Date, to: Date): Row => ({
  paymentStatus: trusted({ $in: PAID }),
  placedAt: trusted({ $gte: from, $lt: to }),
})

async function totals(from: Date, to: Date) {
  const [o] = await Order.aggregate<{
    orders: number
    items: number
    discount: number
    shipping: number
    tax: number
    refunded: number
    net: number
  }>([
    { $match: counted(from, to) },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        items: { $sum: "$pricing.subtotalPaise" },
        discount: { $sum: "$pricing.discountPaise" },
        shipping: { $sum: "$pricing.shippingPaise" },
        tax: { $sum: "$pricing.taxPaise" },
        refunded: { $sum: "$refundedPaise" },
        net: { $sum: net },
      },
    },
  ])
  return o ?? { orders: 0, items: 0, discount: 0, shipping: 0, tax: 0, refunded: 0, net: 0 }
}

async function profit(from: Date, to: Date) {
  const [r] = await Order.aggregate<{ all: number; known: number; profit: number }>([
    { $match: counted(from, to) },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        all: { $sum: lineNet },
        known: {
          $sum: { $cond: [{ $ne: [{ $type: "$items.costLinePaise" }, "missing"] }, lineNet, 0] },
        },
        profit: {
          $sum: {
            $cond: [
              { $ne: [{ $type: "$items.costLinePaise" }, "missing"] },
              { $subtract: [lineNet, "$items.costLinePaise"] },
              0,
            ],
          },
        },
      },
    },
  ])
  return r ?? { all: 0, known: 0, profit: 0 }
}

const share = (b: Map<string, Bucket>) =>
  [...b.values()].sort((a, c) => c.salesPaise - a.salesPaise || a.name.localeCompare(c.name))

/** All reports for a period. Needs `analytics:read`; profit also needs `costs:read`, customers `customers:read`. */
export async function getReports(actor: Actor, range: ReportRange): Promise<Reports> {
  assertPermission(actor, "analytics:read")
  await connectDb()
  const can = (p: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(actor.role, p)
  const { start, end, days } = range
  const prevStart = new Date(start.getTime() - days * DAY)

  const [now_, before] = await Promise.all([totals(start, end), totals(prevStart, start)])
  const aov = (t: { orders: number; net: number }) => (t.orders ? Math.round(t.net / t.orders) : 0)
  const cmp = (a: number, b: number): Compared => ({ value: a, previous: b })
  const summary: Reports["summary"] = {
    orders: cmp(now_.orders, before.orders),
    itemSalesPaise: cmp(now_.items, before.items),
    discountPaise: cmp(now_.discount, before.discount),
    shippingPaise: cmp(now_.shipping, before.shipping),
    taxPaise: cmp(now_.tax, before.tax),
    refundedPaise: cmp(now_.refunded, before.refunded),
    netPaise: cmp(now_.net, before.net),
    averageOrderPaise: cmp(aov(now_), aov(before)),
  }
  if (can("costs:read")) {
    const [a, b] = await Promise.all([profit(start, end), profit(prevStart, start)])
    summary.profit = {
      value: cmp(a.profit, b.profit),
      coveredPct: a.all ? Math.round((a.known / a.all) * 100) : 100,
    }
  }

  // Day by day, with the days that had no sales shown as zero.
  const dailyRows = await Order.aggregate<{ _id: string; orders: number; net: number }>([
    { $match: counted(start, end) },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$placedAt", timezone: "Asia/Kolkata" } },
        orders: { $sum: 1 },
        net: { $sum: net },
      },
    },
  ])
  const byDay = new Map(dailyRows.map((d) => [d._id, d]))
  const daily = Array.from({ length: days }, (_, i) => {
    const date = istDate(new Date(start.getTime() + i * DAY + 1000))
    const d = byDay.get(date)
    return { date, orders: d?.orders ?? 0, netPaise: d?.net ?? 0 }
  })

  // Sales by product, then grouped by the product's category, fabric and print.
  const sold = await Order.aggregate<{
    _id: mongoose.Types.ObjectId
    lines: number
    sales: number
    qty: number
    unit: SellingUnit
    name: string
    cost: number
    known: number
  }>([
    { $match: counted(start, end) },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        lines: { $sum: 1 },
        sales: { $sum: lineNet },
        qty: { $sum: "$items.qty" },
        unit: { $first: "$items.unit" },
        name: { $first: "$items.name" },
        known: {
          $sum: { $cond: [{ $ne: [{ $type: "$items.costLinePaise" }, "missing"] }, lineNet, 0] },
        },
        cost: {
          $sum: {
            $cond: [
              { $ne: [{ $type: "$items.costLinePaise" }, "missing"] },
              "$items.costLinePaise",
              0,
            ],
          },
        },
      },
    },
  ])
  const products = await Product.find({ _id: trusted({ $in: sold.map((s) => s._id) }) } as never)
    .select({ slug: 1, name: 1, categoryIds: 1, fabricId: 1, printId: 1 })
    .lean<
      {
        _id: mongoose.Types.ObjectId
        slug: string
        name: string
        categoryIds: mongoose.Types.ObjectId[]
        fabricId?: mongoose.Types.ObjectId | null
        printId?: mongoose.Types.ObjectId | null
      }[]
    >()
  const byProduct = new Map(products.map((p) => [String(p._id), p]))
  const categories = await Category.find({})
    .select({ name: 1, parentId: 1 })
    .lean<
      { _id: mongoose.Types.ObjectId; name: string; parentId?: mongoose.Types.ObjectId | null }[]
    >()
  const catName = new Map(categories.map((c) => [String(c._id), c]))
  const taxa = await Taxon.find({})
    .select({ name: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
  const taxName = new Map(taxa.map((t) => [String(t._id), t.name]))

  const showProfit = can("costs:read")
  const add = (map: Map<string, Bucket>, key: string, name: string, s: (typeof sold)[number]) => {
    const b = map.get(key) ?? {
      key,
      name,
      lines: 0,
      salesPaise: 0,
      ...(showProfit ? { profitPaise: 0 } : {}),
    }
    b.lines += s.lines
    b.salesPaise += s.sales
    if (showProfit) b.profitPaise = (b.profitPaise ?? 0) + (s.known - s.cost)
    map.set(key, b)
  }
  const catMap = new Map<string, Bucket>()
  const fabMap = new Map<string, Bucket>()
  const printMap = new Map<string, Bucket>()
  const productRows: Reports["products"] = []
  for (const s of sold) {
    const p = byProduct.get(String(s._id))
    const leaf = p?.categoryIds[0] ? catName.get(String(p.categoryIds[0])) : undefined
    const top = leaf?.parentId ? catName.get(String(leaf.parentId)) : leaf
    // A sub-category is shown under its parent, as "Dupattas / Bandhani".
    const label = !leaf
      ? "No category"
      : top && top !== leaf
        ? `${top.name} / ${leaf.name}`
        : leaf.name
    add(catMap, leaf ? String(leaf._id) : "none", label, s)
    add(
      fabMap,
      p?.fabricId ? String(p.fabricId) : "none",
      (p?.fabricId && taxName.get(String(p.fabricId))) || "No fabric set",
      s
    )
    add(
      printMap,
      p?.printId ? String(p.printId) : "none",
      (p?.printId && taxName.get(String(p.printId))) || "No print or plain",
      s
    )
    productRows.push({
      key: String(s._id),
      name: p?.name ?? s.name,
      slug: p?.slug ?? "",
      lines: s.lines,
      salesPaise: s.sales,
      quantityText: formatQuantity(s.unit, s.qty),
      ...(showProfit ? { profitPaise: s.known - s.cost } : {}),
    })
  }
  productRows.sort((a, c) => c.salesPaise - a.salesPaise || a.name.localeCompare(c.name))

  const stateRows = await Order.aggregate<{ _id: string; orders: number; net: number }>([
    { $match: counted(start, end) },
    { $group: { _id: "$shippingAddress.state", orders: { $sum: 1 }, net: { $sum: net } } },
    { $sort: { net: -1, _id: 1 } },
  ])
  const channelRows = await Order.aggregate<{ _id: string | null; orders: number; net: number }>([
    { $match: counted(start, end) },
    { $group: { _id: "$channel", orders: { $sum: 1 }, net: { $sum: net } } },
  ])
  const channels: Reports["channels"] = (["online", "store"] as const).map((channel) => {
    // Orders made before shop sales existed have no channel and were all online.
    const rows = channelRows.filter((r) =>
      channel === "store" ? r._id === "store" : r._id !== "store"
    )
    return {
      channel,
      orders: rows.reduce((sum, r) => sum + r.orders, 0),
      netPaise: rows.reduce((sum, r) => sum + r.net, 0),
    }
  })
  const couponRows = await Order.aggregate<{
    _id: string
    orders: number
    discount: number
    net: number
  }>([
    { $match: { ...counted(start, end), "coupon.code": trusted({ $exists: true }) } },
    {
      $group: {
        _id: "$coupon.code",
        orders: { $sum: 1 },
        discount: { $sum: "$pricing.discountPaise" },
        net: { $sum: net },
      },
    },
    { $sort: { discount: -1, _id: 1 } },
  ])

  // Orders started in the period (an order is created when the customer presses Pay) and how they ended.
  const funnelRows = await Order.aggregate<{ _id: { s: string; p: string }; n: number }>([
    // A sale made in the shop is never "started" at a checkout, so it is not part of this funnel.
    {
      $match: { createdAt: trusted({ $gte: start, $lt: end }), channel: trusted({ $ne: "store" }) },
    },
    { $group: { _id: { s: "$status", p: "$paymentStatus" }, n: { $sum: 1 } } },
  ])
  const checkout: Reports["checkout"] = {
    started: 0,
    paid: 0,
    awaitingPayment: 0,
    failed: 0,
    expired: 0,
    cancelled: 0,
    other: 0,
  }
  for (const r of funnelRows) {
    checkout.started += r.n
    if (PAID.includes(r._id.p)) checkout.paid += r.n
    else if (r._id.s === "pending_payment") checkout.awaitingPayment += r.n
    else if (r._id.p === "failed") checkout.failed += r.n
    else if (r._id.s === "expired") checkout.expired += r.n
    else if (r._id.s === "cancelled") checkout.cancelled += r.n
    else checkout.other += r.n
  }

  const out: Reports = {
    range,
    summary,
    daily,
    products: productRows,
    categories: share(catMap),
    fabrics: share(fabMap),
    prints: share(printMap),
    states: stateRows.map((r) => ({
      state: r._id || "Unknown",
      orders: r.orders,
      netPaise: r.net,
    })),
    channels,
    coupons: couponRows.map((r) => ({
      code: r._id,
      orders: r.orders,
      discountPaise: r.discount,
      netPaise: r.net,
    })),
    checkout,
    aftercare: {
      delivered: await Order.countDocuments({
        deliveredAt: trusted({ $gte: start, $lt: end }),
      } as never),
      returnRequests: await ReturnRequest.countDocuments({
        createdAt: trusted({ $gte: start, $lt: end }),
      } as never),
      ...(await (async () => {
        const [r] = await Refund.aggregate<{ n: number; total: number }>([
          { $match: { status: "processed", createdAt: { $gte: start, $lt: end } } },
          { $group: { _id: null, n: { $sum: 1 }, total: { $sum: "$amountPaise" } } },
        ])
        return { refundCount: r?.n ?? 0, refundsPaise: r?.total ?? 0 }
      })()),
      undelivered: await Order.countDocuments({
        ...counted(start, end),
        fulfillmentStatus: trusted({
          $in: ["unfulfilled", "packed", "shipped", "out_for_delivery"],
        }),
      } as never),
    },
  }

  if (can("customers:read")) {
    // New or returning is judged by the person's earlier counted orders, whatever the period.
    const buyers = await Order.distinct("userId", {
      ...counted(start, end),
      channel: trusted({ $ne: "store" }),
    })
    const earlier = await Order.distinct("userId", {
      paymentStatus: trusted({ $in: PAID }),
      placedAt: trusted({ $lt: start }),
      userId: trusted({ $in: buyers }),
    } as never)
    out.customers = {
      buyers: buyers.length,
      returning: earlier.length,
      first: buyers.length - earlier.length,
    }
  }
  return out
}

export type ReportKind =
  "daily" | "products" | "categories" | "fabrics" | "prints" | "states" | "coupons"
export const REPORT_KINDS: readonly ReportKind[] = [
  "daily",
  "products",
  "categories",
  "fabrics",
  "prints",
  "states",
  "coupons",
]
export const isReportKind = (v: string | null | undefined): v is ReportKind =>
  REPORT_KINDS.includes(v as ReportKind)

const rupees = (paise: number) => (paise / 100).toFixed(2)

/** One report as a spreadsheet. Same figures and permission as the page. */
export async function reportCsv(
  actor: Actor,
  kind: ReportKind,
  range: ReportRange
): Promise<{ filename: string; csv: string }> {
  const r = await getReports(actor, range)
  const filename = `ambar-${kind}-${range.from}-to-${range.to}.csv`
  // Columns follow the person's permission, not the data, so an empty period has the same columns.
  const profit = r.summary.profit !== undefined
  const bucket = (label: string, rows: Bucket[]) => {
    return toCsv([
      [label, "Order lines", "Item sales (Rs)", ...(profit ? ["Profit (Rs)"] : [])],
      ...rows.map((x) => [
        x.name,
        x.lines,
        rupees(x.salesPaise),
        ...(profit ? [rupees(x.profitPaise ?? 0)] : []),
      ]),
    ])
  }
  switch (kind) {
    case "daily":
      return {
        filename,
        csv: toCsv([
          ["Date", "Orders", "Net sales (Rs)"],
          ...r.daily.map((d) => [d.date, d.orders, rupees(d.netPaise)]),
        ]),
      }
    case "products": {
      return {
        filename,
        csv: toCsv([
          [
            "Product",
            "Quantity sold",
            "Order lines",
            "Item sales (Rs)",
            ...(profit ? ["Profit (Rs)"] : []),
          ],
          ...r.products.map((x) => [
            x.name,
            x.quantityText,
            x.lines,
            rupees(x.salesPaise),
            ...(profit ? [rupees(x.profitPaise ?? 0)] : []),
          ]),
        ]),
      }
    }
    case "categories":
      return { filename, csv: bucket("Category", r.categories) }
    case "fabrics":
      return { filename, csv: bucket("Fabric", r.fabrics) }
    case "prints":
      return { filename, csv: bucket("Print", r.prints) }
    case "states":
      return {
        filename,
        csv: toCsv([
          ["State", "Orders", "Net sales (Rs)"],
          ...r.states.map((s) => [s.state, s.orders, rupees(s.netPaise)]),
        ]),
      }
    case "coupons":
      return {
        filename,
        csv: toCsv([
          ["Code", "Orders", "Discount given (Rs)", "Net sales (Rs)"],
          ...r.coupons.map((c) => [c.code, c.orders, rupees(c.discountPaise), rupees(c.netPaise)]),
        ]),
      }
  }
}

/** Quick choices for the period picker, worked out in India time. */
export function reportPresets(now = new Date()): { label: string; from: string; to: string }[] {
  const today = istDate(startOfIndianDay(now))
  const [y, m] = today.split("-").map(Number) as [number, number]
  const pad = (n: number) => String(n).padStart(2, "0")
  const daysBack = (n: number) => istDate(new Date(startOfIndianDay(now).getTime() - (n - 1) * DAY))
  const lastMonth = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  const lastDay = new Date(Date.UTC(lastMonth.y, lastMonth.m, 0)).getUTCDate()
  const financialYear = m >= 4 ? y : y - 1
  return [
    { label: "Last 7 days", from: daysBack(7), to: today },
    { label: "Last 30 days", from: daysBack(30), to: today },
    { label: "Last 90 days", from: daysBack(90), to: today },
    { label: "This month", from: `${y}-${pad(m)}-01`, to: today },
    {
      label: "Last month",
      from: `${lastMonth.y}-${pad(lastMonth.m)}-01`,
      to: `${lastMonth.y}-${pad(lastMonth.m)}-${pad(lastDay)}`,
    },
    { label: "This financial year", from: `${financialYear}-04-01`, to: today },
  ]
}
