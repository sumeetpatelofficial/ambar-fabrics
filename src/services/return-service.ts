import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { formatQuantity } from "@/lib/measure"
import { mulDivRound } from "@/lib/money"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { Order, type OrderDoc } from "@/models/order"
import { ReturnRequest, type ReturnRequestDoc } from "@/models/return-request"
import { recordAudit } from "@/services/audit-service"
import { adjustStock } from "@/services/inventory-service"
import { getCommerceSettings } from "@/services/order-service"
import { refundOrderAsStaff } from "@/services/refund-service"

const trusted = mongoose.trusted
const oid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id))
const COUNTED = ["requested", "approved", "received", "refunded"]

/** Quantity of each variant already in a return that has not been refused. */
async function alreadyReturned(orderId: mongoose.Types.ObjectId) {
  const open = await ReturnRequest.find({
    orderId,
    status: trusted({ $in: COUNTED }) as never,
  }).lean<ReturnRequestDoc[]>()
  const taken = new Map<string, number>()
  for (const r of open)
    for (const i of r.items)
      taken.set(String(i.variantId), (taken.get(String(i.variantId)) ?? 0) + i.qty)
  return taken
}

/**
 * A customer asks to send items back. Only their own delivered order, inside the return window, only items
 * that can be returned (never fabric cut to length), and never more than they bought.
 */
export async function requestReturn(
  userId: string,
  orderNumber: string,
  items: { variantId: string; qty: number }[],
  reason: string,
  now = new Date()
): Promise<ReturnRequestDoc> {
  await connectDb()
  const order = await Order.findOne({ orderNumber, userId: oid(userId) }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  if (order.fulfillmentStatus !== "delivered" || !order.deliveredAt)
    throw new ValidationError("You can ask for a return once the order has been delivered.")
  const { returnWindowDays } = await getCommerceSettings()
  const closes = new Date(order.deliveredAt.getTime() + returnWindowDays * 24 * 3600 * 1000)
  if (now > closes)
    throw new ValidationError(
      `The ${returnWindowDays}-day return window for this order has closed.`
    )
  if (reason.trim().length < 3) throw new ValidationError("Tell us why you are returning it.")
  if (items.length === 0) throw new ValidationError("Choose at least one item to return.")

  const taken = await alreadyReturned(order._id)
  const seen = new Set<string>()
  for (const wanted of items) {
    if (seen.has(wanted.variantId)) throw new ValidationError("Each item can be listed once.")
    seen.add(wanted.variantId)
    const line = order.items.find((i) => String(i.variantId) === wanted.variantId)
    if (!line) throw new ValidationError("One of those items is not in this order.")
    if (!line.returnable)
      throw new ValidationError(
        line.unit.kind === "length"
          ? `${line.name} is fabric cut to your length, so it cannot be returned.`
          : `${line.name} cannot be returned.`
      )
    if (!Number.isSafeInteger(wanted.qty) || wanted.qty < 1)
      throw new ValidationError("Choose how many to return.")
    const left = line.qty - (taken.get(wanted.variantId) ?? 0)
    if (wanted.qty > left)
      throw new ValidationError(
        left === 0
          ? `${line.name} is already in a return.`
          : `You can return at most ${formatQuantity(line.unit, left)} of ${line.name}.`
      )
  }
  const created = await ReturnRequest.create({
    orderId: order._id,
    userId: oid(userId),
    items: items.map((i) => ({ variantId: oid(i.variantId), qty: i.qty })),
    reason: reason.trim().slice(0, 500),
  })
  return created.toObject() as ReturnRequestDoc
}

export async function decideReturn(
  actor: Actor,
  returnId: string,
  decision: { approve: true } | { approve: false; note: string }
): Promise<void> {
  assertPermission(actor, "returns:manage")
  await connectDb()
  if (!decision.approve && !decision.note.trim())
    throw new ValidationError("Give the customer a reason for refusing.")
  const done = await ReturnRequest.updateOne(
    { _id: oid(returnId), status: "requested" },
    {
      $set: {
        status: decision.approve ? "approved" : "rejected",
        decidedBy: oid(actor.id),
        ...(decision.approve ? {} : { decisionNote: decision.note.trim().slice(0, 300) }),
      },
    }
  )
  if (done.modifiedCount !== 1) throw new ValidationError("That return has already been decided.")
  await recordAudit({
    action: decision.approve ? "return.approved" : "return.rejected",
    actor,
    entityType: "return",
    entityId: returnId,
  })
}

/**
 * The parcel came back and passed inspection: the items go back on the shelf and the customer is refunded
 * the price paid for them (after any discount), not the shipping.
 */
export async function receiveReturn(actor: Actor, returnId: string): Promise<ReturnRequestDoc> {
  assertPermission(actor, "returns:manage")
  await connectDb()
  const claimed = await ReturnRequest.findOneAndUpdate(
    { _id: oid(returnId), status: "approved" },
    { $set: { status: "received" } },
    { returnDocument: "after" }
  ).lean<ReturnRequestDoc>()
  if (!claimed) throw new ValidationError("That return is not waiting to be received.")
  const order = (await Order.findById(claimed.orderId).lean<OrderDoc>())!

  let refundPaise = 0
  for (const item of claimed.items) {
    const line = order.items.find((i) => String(i.variantId) === String(item.variantId))!
    refundPaise += mulDivRound(line.linePaise - line.discountPaise, item.qty, line.qty)
    await adjustStock({
      variantId: item.variantId,
      delta: item.qty,
      type: "restock",
      reason: `Return for order ${order.orderNumber}`,
      idempotencyKey: `return-restock:${returnId}:${item.variantId}`,
      orderId: order._id,
      actorId: actor.id,
    })
  }
  const refund = await refundOrderAsStaff(actor, {
    orderId: String(order._id),
    amountPaise: refundPaise,
    reason: `Return ${returnId}`,
    idempotencyKey: `return:${returnId}`,
  })
  const final = await ReturnRequest.findByIdAndUpdate(
    claimed._id,
    { $set: { status: "refunded", refundId: refund._id, refundAmountPaise: refundPaise } },
    { returnDocument: "after" }
  ).lean<ReturnRequestDoc>()
  await recordAudit({
    action: "return.received",
    actor,
    entityType: "return",
    entityId: returnId,
    details: { refundPaise },
  })
  return final!
}

export async function listReturnsForOrder(orderId: string): Promise<ReturnRequestDoc[]> {
  await connectDb()
  return ReturnRequest.find({ orderId: oid(orderId) })
    .sort({ createdAt: -1 })
    .lean<ReturnRequestDoc[]>()
}
