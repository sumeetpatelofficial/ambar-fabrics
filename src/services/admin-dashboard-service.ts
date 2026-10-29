import { WALK_IN_EMAIL } from "@/lib/walk-in"
import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { roleHasPermission } from "@/config/permissions"
import type { Actor } from "@/lib/security/authorize"
import { availableQty } from "@/lib/inventory"
import { formatQuantity, type SellingUnit } from "@/lib/measure"
import { Order, type OrderDoc } from "@/models/order"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { ReturnRequest } from "@/models/return-request"
import { Review } from "@/models/review"
import { User } from "@/models/user"

const trusted = mongoose.trusted
const IST_OFFSET_MS = 5.5 * 3600 * 1000

/** Midnight at the start of today in India, as a UTC instant. */
export function startOfIndianDay(now: Date): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MS)
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() - IST_OFFSET_MS)
}

export type DashboardMetrics = {
  ordersToday?: number
  /** Money kept (paid minus refunded) for orders placed today and in the last 7 days. */
  revenueTodayPaise?: number
  revenueWeekPaise?: number
  toShip?: number
  needsAttention?: number
  returnsToHandle?: number
  lowStock?: number
  outOfStock?: number
}

/** Counts for the admin home. Each figure appears only for roles allowed to see what it comes from. */
export async function getDashboardMetrics(
  actor: Actor,
  now = new Date()
): Promise<DashboardMetrics> {
  await connectDb()
  const can = (p: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(actor.role, p)
  const today = startOfIndianDay(now)
  const week = new Date(today.getTime() - 6 * 86_400_000)
  const out: DashboardMetrics = {}
  const paid: Record<string, unknown> = {
    paymentStatus: trusted({ $in: ["paid", "partially_refunded", "refunded"] }),
  }

  if (can("orders:read")) {
    out.ordersToday = await Order.countDocuments({
      ...paid,
      placedAt: trusted({ $gte: today }),
    } as never)
    out.toShip = await Order.countDocuments({
      status: trusted({ $in: ["confirmed", "processing"] }),
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      channel: trusted({ $ne: "store" }),
    })
    out.needsAttention = await Order.countDocuments({ status: "needs_attention" })
  }
  if (can("returns:manage"))
    out.returnsToHandle = await ReturnRequest.countDocuments({
      status: trusted({ $in: ["requested", "approved"] }),
    })
  if (can("analytics:read")) {
    const sum = async (from: Date) => {
      const [row] = await Order.aggregate<{ total: number }>([
        { $match: { ...paid, placedAt: { $gte: from } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $subtract: ["$pricing.totalPaise", "$refundedPaise"] } },
          },
        },
      ])
      return row?.total ?? 0
    }
    out.revenueTodayPaise = await sum(today)
    out.revenueWeekPaise = await sum(week)
  }
  if (can("inventory:read")) {
    const available = { $subtract: ["$stock.onHand", "$stock.reserved"] }
    out.outOfStock = await ProductVariant.countDocuments({
      status: "active",
      $expr: trusted({ $lte: [available, 0] }),
    })
    out.lowStock = await ProductVariant.countDocuments({
      status: "active",
      $expr: trusted({
        $and: [{ $gt: [available, 0] }, { $lte: [available, "$lowStockThreshold"] }],
      }),
    })
  }
  return out
}

// ------------------------------------------------------------------ the overview page

export const RANGES = {
  today: { days: 1, label: "Today" },
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" },
} as const
export type RangeKey = keyof typeof RANGES
export const parseRange = (v: string | undefined): RangeKey =>
  v && v in RANGES ? (v as RangeKey) : "30d"

export type Compared = { value: number; previous: number }

export type Overview = {
  range: RangeKey
  from: string
  to: string
  kpis?: {
    /** Estimated from what each item cost when it was sold. Only for roles that may see costs. */
    profit?: { value: Compared; coveredPct: number }
    revenuePaise: Compared
    orders: Compared
    averageOrderPaise: Compared
    newCustomers?: Compared
  }
  series?: { date: string; revenuePaise: number }[]
  top?: {
    productId: string
    name: string
    slug: string
    imageUrl?: string
    swatch?: string
    unitsText: string
    revenuePaise: number
  }[]
  segments?: { new: number; returning: number; loyal: number }
  stockAlerts?: {
    variantId: string
    name: string
    slug: string
    sku: string
    availableText: string
    out: boolean
    imageUrl?: string
    swatch?: string
  }[]
  recentOrders?: {
    orderNumber: string
    customer: string
    date: string
    totalPaise: number
    status: string
    fulfillment: string
    paymentStatus: string
  }[]
  attention: { toShip?: number; returns?: number; needsAttention?: number; reviews?: number }
}

const DAY = 86_400_000
const istDay = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)

/** Things waiting for a person, for the bell in the top bar. Each count is shown only to roles that can act on it. */
export async function getAttention(actor: Actor): Promise<Overview["attention"]> {
  await connectDb()
  const can = (p: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(actor.role, p)
  const out: Overview["attention"] = {}
  if (can("orders:read")) {
    out.toShip = await Order.countDocuments({
      status: trusted({ $in: ["confirmed", "processing"] }),
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      channel: trusted({ $ne: "store" }),
    })
    out.needsAttention = await Order.countDocuments({ status: "needs_attention" })
  }
  if (can("returns:manage"))
    out.returns = await ReturnRequest.countDocuments({
      status: trusted({ $in: ["requested", "approved"] }),
    })
  if (can("reviews:moderate")) out.reviews = await Review.countDocuments({ status: "pending" })
  return out
}

/** The admin home: figures for a period compared with the one before it, a daily sales line, and what needs doing. */
export async function getOverview(
  actor: Actor,
  range: RangeKey = "30d",
  now = new Date()
): Promise<Overview> {
  await connectDb()
  const can = (p: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(actor.role, p)
  const days = RANGES[range].days
  const end = new Date(startOfIndianDay(now).getTime() + DAY) // up to and including today
  const start = new Date(end.getTime() - days * DAY)
  const prevStart = new Date(start.getTime() - days * DAY)
  const paid: Record<string, unknown> = {
    paymentStatus: trusted({ $in: ["paid", "partially_refunded", "refunded"] }),
  }
  const placed = (from: Date, to: Date) =>
    ({ ...paid, placedAt: trusted({ $gte: from, $lt: to }) }) as never
  const out: Overview = {
    range,
    from: start.toISOString(),
    to: end.toISOString(),
    attention: await getAttention(actor),
  }

  if (can("analytics:read")) {
    const totals = async (from: Date, to: Date) => {
      const [row] = await Order.aggregate<{ revenue: number; orders: number }>([
        { $match: placed(from, to) },
        {
          $group: {
            _id: null,
            revenue: { $sum: { $subtract: ["$pricing.totalPaise", "$refundedPaise"] } },
            orders: { $sum: 1 },
          },
        },
      ])
      return { revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 }
    }
    const [now_, before] = await Promise.all([totals(start, end), totals(prevStart, start)])
    const aov = (t: { revenue: number; orders: number }) =>
      t.orders ? Math.round(t.revenue / t.orders) : 0
    out.kpis = {
      revenuePaise: { value: now_.revenue, previous: before.revenue },
      orders: { value: now_.orders, previous: before.orders },
      averageOrderPaise: { value: aov(now_), previous: aov(before) },
    }
    if (can("costs:read")) {
      const margin = async (from: Date, to: Date) => {
        const [row] = await Order.aggregate<{ profit: number; known: number; all: number }>([
          { $match: placed(from, to) },
          { $unwind: "$items" },
          {
            $group: {
              _id: null,
              all: { $sum: { $subtract: ["$items.linePaise", "$items.discountPaise"] } },
              known: {
                $sum: {
                  $cond: [
                    { $ne: [{ $type: "$items.costLinePaise" }, "missing"] },
                    { $subtract: ["$items.linePaise", "$items.discountPaise"] },
                    0,
                  ],
                },
              },
              profit: {
                $sum: {
                  $cond: [
                    { $ne: [{ $type: "$items.costLinePaise" }, "missing"] },
                    {
                      $subtract: [
                        { $subtract: ["$items.linePaise", "$items.discountPaise"] },
                        "$items.costLinePaise",
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
        ])
        return { profit: row?.profit ?? 0, known: row?.known ?? 0, all: row?.all ?? 0 }
      }
      const [now2, before2] = await Promise.all([margin(start, end), margin(prevStart, start)])
      out.kpis.profit = {
        value: { value: now2.profit, previous: before2.profit },
        coveredPct: now2.all ? Math.round((now2.known / now2.all) * 100) : 100,
      }
    }
    if (can("customers:read"))
      out.kpis.newCustomers = {
        value: await User.countDocuments({
          role: "customer",
          email: trusted({ $ne: WALK_IN_EMAIL }),
          createdAt: trusted({ $gte: start, $lt: end }),
        } as never),
        previous: await User.countDocuments({
          role: "customer",
          email: trusted({ $ne: WALK_IN_EMAIL }),
          createdAt: trusted({ $gte: prevStart, $lt: start }),
        } as never),
      }

    const daily = await Order.aggregate<{ _id: string; revenue: number }>([
      { $match: placed(start, end) },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$placedAt", timezone: "Asia/Kolkata" },
          },
          revenue: { $sum: { $subtract: ["$pricing.totalPaise", "$refundedPaise"] } },
        },
      },
    ])
    const byDay = new Map(daily.map((d) => [d._id, d.revenue]))
    out.series = Array.from({ length: days }, (_, i) => {
      const date = istDay(new Date(start.getTime() + i * DAY + 1000))
      return { date, revenuePaise: byDay.get(date) ?? 0 }
    })

    const sold = await Order.aggregate<{
      _id: mongoose.Types.ObjectId
      revenue: number
      qty: number
      unit: SellingUnit
      name: string
    }>([
      { $match: placed(start, end) },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          revenue: { $sum: { $subtract: ["$items.linePaise", "$items.discountPaise"] } },
          qty: { $sum: "$items.qty" },
          unit: { $first: "$items.unit" },
          name: { $first: "$items.name" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ])
    const products = await Product.find({ _id: trusted({ $in: sold.map((s) => s._id) }) } as never)
      .select({ slug: 1, images: 1, swatches: 1 })
      .lean<
        {
          _id: mongoose.Types.ObjectId
          slug: string
          images: { url: string }[]
          swatches: { hex: string }[]
        }[]
      >()
    const byId = new Map(products.map((p) => [String(p._id), p]))
    out.top = sold.map((s) => {
      const p = byId.get(String(s._id))
      return {
        productId: String(s._id),
        name: s.name,
        slug: p?.slug ?? "",
        imageUrl: p?.images?.[0]?.url,
        swatch: p?.swatches?.[0]?.hex,
        unitsText: formatQuantity(s.unit, s.qty),
        revenuePaise: s.revenue,
      }
    })

    if (can("customers:read")) {
      const buyers = await Order.distinct("userId", {
        ...(placed(start, end) as object),
        channel: trusted({ $ne: "store" }),
      } as never)
      const lifetime = await Order.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
        { $match: { ...paid, userId: { $in: buyers } } },
        { $group: { _id: "$userId", n: { $sum: 1 } } },
      ])
      out.segments = { new: 0, returning: 0, loyal: 0 }
      for (const l of lifetime)
        out.segments[l.n >= 3 ? "loyal" : l.n === 2 ? "returning" : "new"] += 1
    }
  }

  if (can("inventory:read")) {
    const available = { $subtract: ["$stock.onHand", "$stock.reserved"] }
    const variants = await ProductVariant.find({
      status: "active",
      $expr: trusted({ $lte: [available, "$lowStockThreshold"] }),
    } as never)
      .sort({ "stock.onHand": 1 })
      .limit(5)
      .lean<ProductVariantDoc[]>()
    const prods = await Product.find({
      _id: trusted({ $in: variants.map((v) => v.productId) }),
    } as never)
      .select({ name: 1, slug: 1, images: 1, swatches: 1 })
      .lean<
        {
          _id: mongoose.Types.ObjectId
          name: string
          slug: string
          images: { url: string }[]
          swatches: { hex: string }[]
        }[]
      >()
    const names = new Map(prods.map((p) => [String(p._id), p]))
    out.stockAlerts = variants.map((v) => {
      const left = availableQty(v.stock)
      return {
        variantId: String(v._id),
        name: names.get(String(v.productId))?.name ?? v.sku,
        slug: names.get(String(v.productId))?.slug ?? "",
        sku: v.sku,
        availableText: left <= 0 ? "Out of stock" : `${formatQuantity(v.sellingUnit, left)} left`,
        out: left <= 0,
        imageUrl: names.get(String(v.productId))?.images?.[0]?.url,
        swatch: names.get(String(v.productId))?.swatches?.[0]?.hex,
      }
    })
  }

  if (can("orders:read")) {
    const recent = await Order.find({
      status: trusted({ $nin: ["pending_payment", "expired"] }),
    } as never)
      .sort({ createdAt: -1 })
      .limit(6)
      .select({
        orderNumber: 1,
        email: 1,
        shippingAddress: 1,
        createdAt: 1,
        pricing: 1,
        status: 1,
        fulfillmentStatus: 1,
        paymentStatus: 1,
      })
      .lean<OrderDoc[]>()
    out.recentOrders = recent.map((o) => ({
      orderNumber: o.orderNumber,
      customer: o.shippingAddress.fullName,
      date: o.createdAt.toISOString(),
      totalPaise: o.pricing.totalPaise,
      status: o.status,
      fulfillment: o.fulfillmentStatus,
      paymentStatus: o.paymentStatus,
    }))
  }
  return out
}

/** This month's sales so far and the last 14 days as a trend, for the card in the sidebar. Only for roles that may see money. */
export async function getMonthGlance(
  actor: Actor,
  now = new Date()
): Promise<{ monthPaise: number; trend: number[] } | null> {
  if (!roleHasPermission(actor.role, "analytics:read")) return null
  await connectDb()
  const today = startOfIndianDay(now)
  const local = new Date(now.getTime() + IST_OFFSET_MS)
  const monthStart = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - IST_OFFSET_MS
  )
  const from = new Date(Math.min(monthStart.getTime(), today.getTime() - 13 * DAY))
  const rows = await Order.aggregate<{ _id: string; revenue: number }>([
    {
      $match: {
        paymentStatus: { $in: ["paid", "partially_refunded", "refunded"] },
        placedAt: { $gte: from },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$placedAt", timezone: "Asia/Kolkata" } },
        revenue: { $sum: { $subtract: ["$pricing.totalPaise", "$refundedPaise"] } },
      },
    },
  ])
  const byDay = new Map(rows.map((r) => [r._id, r.revenue]))
  const monthKey = istDay(now).slice(0, 7)
  let monthPaise = 0
  for (const [d, v] of byDay) if (d.startsWith(monthKey)) monthPaise += v
  const trend = Array.from(
    { length: 14 },
    (_, i) => byDay.get(istDay(new Date(today.getTime() - (13 - i) * DAY + 1000))) ?? 0
  )
  return { monthPaise, trend }
}
