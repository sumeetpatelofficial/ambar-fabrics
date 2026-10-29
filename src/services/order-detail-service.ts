import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError } from "@/lib/errors"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { Order, type OrderDoc } from "@/models/order"
import { ReturnRequest, type ReturnRequestDoc } from "@/models/return-request"
import { getOrderForUser, getCommerceSettings, type OrderView } from "@/services/order-service"
import { getShipmentView, type ShipmentView } from "@/services/shipping-service"

const trusted = mongoose.trusted
const oid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id))

export type ReturnView = {
  id: string
  status: ReturnRequestDoc["status"]
  reason: string
  decisionNote?: string
  refundAmountPaise?: number
  createdAt: string
  items: { variantId: string; qty: number }[]
}

export type OrderDetail = OrderView & {
  fulfillmentStatus: OrderDoc["fulfillmentStatus"]
  deliveredAt?: string
  shipment: ShipmentView | null
  returns: ReturnView[]
  /** The customer may still cancel it themselves. */
  canCancel: boolean
  /** Items that can still be returned, and the date the window closes. */
  returnable: {
    variantId: string
    name: string
    left: number
    unit: OrderView["items"][number]["unit"]
  }[]
  returnWindowEnds?: string
}

const toReturnView = (r: ReturnRequestDoc): ReturnView => ({
  id: String(r._id),
  status: r.status,
  reason: r.reason,
  decisionNote: r.decisionNote,
  refundAmountPaise: r.refundAmountPaise,
  createdAt: r.createdAt.toISOString(),
  items: r.items.map((i) => ({ variantId: String(i.variantId), qty: i.qty })),
})

async function build(
  order: OrderDoc,
  view: OrderView,
  includeLabel: boolean,
  now: Date
): Promise<OrderDetail> {
  const [shipment, returns, settings] = await Promise.all([
    getShipmentView(String(order._id), includeLabel),
    ReturnRequest.find({ orderId: order._id }).sort({ createdAt: -1 }).lean<ReturnRequestDoc[]>(),
    getCommerceSettings(),
  ])
  const taken = new Map<string, number>()
  for (const r of returns)
    if (r.status !== "rejected")
      for (const i of r.items)
        taken.set(String(i.variantId), (taken.get(String(i.variantId)) ?? 0) + i.qty)
  const windowEnds =
    order.deliveredAt &&
    new Date(order.deliveredAt.getTime() + settings.returnWindowDays * 86_400_000)
  const open = Boolean(windowEnds && now <= windowEnds && order.fulfillmentStatus === "delivered")
  return {
    ...view,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveredAt: order.deliveredAt?.toISOString(),
    shipment,
    returns: returns.map(toReturnView),
    canCancel:
      order.status === "confirmed" && order.paymentStatus === "paid" && !order.shipmentClaim,
    returnable: open
      ? order.items
          .filter((i) => i.returnable)
          .map((i) => ({
            variantId: String(i.variantId),
            name: i.name,
            left: i.qty - (taken.get(String(i.variantId)) ?? 0),
            unit: i.unit,
          }))
          .filter((i) => i.left > 0)
      : [],
    ...(open && windowEnds ? { returnWindowEnds: windowEnds.toISOString() } : {}),
  }
}

/** A customer's own order with tracking, returns and what they may still do. Anyone else's is "not found". */
export async function getOrderDetail(
  userId: string,
  orderNumber: string,
  now = new Date()
): Promise<OrderDetail | null> {
  const view = await getOrderForUser(userId, orderNumber)
  if (!view) return null
  const order = (await Order.findOne({ orderNumber, userId: oid(userId) }).lean<OrderDoc>())!
  return build(order, view, false, now)
}

export async function getOrderDetailForStaff(
  actor: Actor,
  orderNumber: string,
  now = new Date()
): Promise<OrderDetail & { email: string }> {
  assertPermission(actor, "orders:read")
  await connectDb()
  const order = await Order.findOne({ orderNumber }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  const view = (await getOrderForUser(String(order.userId), orderNumber))!
  return { ...(await build(order, view, true, now)), email: order.email }
}

export type StaffOrderRow = {
  orderNumber: string
  createdAt: string
  email: string
  customer: string
  status: OrderDoc["status"]
  paymentStatus: OrderDoc["paymentStatus"]
  fulfillmentStatus: OrderDoc["fulfillmentStatus"]
  totalPaise: number
  channel: "online" | "store"
}

/** The newest orders first, optionally only those needing a step, one page at a time. */
export async function listOrdersForStaff(
  actor: Actor,
  filter: "all" | "to_ship" | "returns" | "in_store" = "all",
  page = 1,
  pageSize = 20
): Promise<{ rows: StaffOrderRow[]; total: number; pageSize: number }> {
  assertPermission(actor, "orders:read")
  await connectDb()
  let query: Record<string, unknown> = { status: trusted({ $ne: "expired" }) }
  if (filter === "to_ship")
    query = {
      status: trusted({ $in: ["confirmed", "processing"] }),
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      channel: trusted({ $ne: "store" }),
    }
  if (filter === "in_store") query = { channel: "store" }
  if (filter === "returns") {
    const ids = await ReturnRequest.distinct("orderId", {
      status: trusted({ $in: ["requested", "approved"] }),
    })
    query = { _id: trusted({ $in: ids }) }
  }
  const [orders, total] = await Promise.all([
    Order.find(query as never)
      .sort({ createdAt: -1 })
      .skip((Math.max(1, page) - 1) * pageSize)
      .limit(pageSize)
      .lean<OrderDoc[]>(),
    Order.countDocuments(query as never),
  ])
  return {
    total,
    pageSize,
    rows: orders.map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt.toISOString(),
      email: o.email,
      customer: o.shippingAddress.fullName,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      totalPaise: o.pricing.totalPaise,
      channel: o.channel ?? "online",
    })),
  }
}
