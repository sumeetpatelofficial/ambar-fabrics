import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { orderDeliveredMessage, orderShippedMessage } from "@/lib/email/templates"
import { getShippingProvider } from "@/lib/shipping"
import { parcelFor } from "@/lib/shipping/parcel"
import { canMoveShipment, FULFILLMENT_FOR } from "@/lib/shipping/status"
import type { ShipmentStatus, TrackingEvent } from "@/lib/shipping/types"
import { Order, type OrderDoc } from "@/models/order"
import { ReturnRequest } from "@/models/return-request"
import { Shipment, type ShipmentDoc } from "@/models/shipment"
import { WebhookEvent } from "@/models/webhook-event"
import { recordAudit } from "@/services/audit-service"
import { enqueueEmail } from "@/services/job-service"
import { getCommerceSettings, transitionOrder } from "@/services/order-service"

const trusted = mongoose.trusted
const oid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id))
const ACTIVE: ShipmentStatus[] = [
  "created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "rto_initiated",
]

// ------------------------------------------------------------------ booking

async function activeShipment(orderId: string) {
  return Shipment.findOne({
    orderId: oid(orderId),
    status: trusted({ $in: ACTIVE }),
  }).lean<ShipmentDoc>()
}

/** Books a courier for a paid order. One at a time per order: a second request while one is in progress is refused. */
export async function createShipmentForOrder(
  actor: Actor,
  orderNumber: string
): Promise<ShipmentDoc> {
  assertPermission(actor, "shipments:manage")
  await connectDb()
  const order = await Order.findOne({ orderNumber }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  if (order.paymentStatus !== "paid" || !["confirmed", "processing"].includes(order.status))
    throw new ValidationError("Only a paid order that is not cancelled can be shipped.")

  const claimed = await Order.updateOne(
    { _id: order._id, shipmentClaim: trusted({ $exists: false }) },
    { $set: { shipmentClaim: new Date() } }
  )
  if (claimed.modifiedCount !== 1)
    throw new ValidationError("A shipment already exists for this order, or is being booked.")

  try {
    const provider = getShippingProvider()
    const parcel = parcelFor(order.items.reduce((sum, i) => sum + (i.weightGrams ?? 300), 0))
    const a = order.shippingAddress
    const created = await provider.createShipment({
      orderNumber: order.orderNumber,
      placedAt: order.placedAt ?? order.createdAt,
      paymentMethod: "prepaid",
      parcel,
      subtotalPaise: order.pricing.subtotalPaise - order.pricing.discountPaise,
      customer: {
        name: a.fullName,
        phone: a.phone,
        email: order.email,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
      },
      items: order.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        qty: i.unit.kind === "length" ? 1 : i.qty, // fabric is one cut piece, not 2,500 "units"
        unitPricePaise: i.unit.kind === "length" ? i.linePaise : i.unitPricePaise,
      })),
    })
    const shipment = (
      await Shipment.create({
        orderId: order._id,
        provider: provider.name,
        providerOrderId: created.providerOrderId,
        awb: created.awb,
        courier: created.courier,
        trackingUrl: created.trackingUrl,
        labelUrl: created.labelUrl,
        parcel,
        status: "created",
        events: [{ status: "created", at: new Date() }],
        createdBy: oid(actor.id),
      })
    ).toObject() as ShipmentDoc
    await transitionOrder(String(order._id), "shipment.created", {
      actor: `user:${actor.id}`,
      set: { fulfillmentStatus: "packed" },
    })
    await recordAudit({
      action: "shipment.created",
      actor,
      entityType: "order",
      entityId: String(order._id),
      details: { awb: created.awb, courier: created.courier },
    })
    return shipment
  } catch (error) {
    await Order.updateOne({ _id: order._id }, { $unset: { shipmentClaim: 1 } })
    throw error
  }
}

/** Cancels a booking that the courier has not yet collected. */
export async function cancelShipmentForOrder(actor: Actor, orderNumber: string): Promise<void> {
  assertPermission(actor, "shipments:manage")
  await connectDb()
  const order = await Order.findOne({ orderNumber }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  const shipment = await activeShipment(String(order._id))
  if (!shipment) throw new ValidationError("There is no active shipment to cancel.")
  if (shipment.status !== "created")
    throw new ValidationError("The courier has already collected this parcel.")
  await getShippingProvider().cancelShipment({
    providerOrderId: shipment.providerOrderId,
    awb: shipment.awb,
  })
  const done = await Shipment.updateOne(
    { _id: shipment._id, status: "created" },
    { $set: { status: "cancelled" }, $push: { events: { status: "cancelled", at: new Date() } } }
  )
  if (done.modifiedCount === 1) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { fulfillmentStatus: "unfulfilled" }, $unset: { shipmentClaim: 1 } }
    )
    await recordAudit({
      action: "shipment.cancelled",
      actor,
      entityType: "order",
      entityId: String(order._id),
    })
  }
}

// ------------------------------------------------------------------ tracking

/**
 * Applies one courier update. Updates only ever move a shipment forward, so a repeated, late or
 * out-of-order message changes nothing. Returns whether the shipment moved.
 */
export async function applyTrackingEvent(awb: string, event: TrackingEvent): Promise<boolean> {
  await connectDb()
  const shipment = await Shipment.findOne({ awb }).lean<ShipmentDoc>()
  if (!shipment || !canMoveShipment(shipment.status, event.status)) return false
  const from = (Object.keys(FULFILLMENT_FOR) as ShipmentStatus[]).filter((s) =>
    canMoveShipment(s, event.status)
  )
  const moved = await Shipment.findOneAndUpdate(
    { _id: shipment._id, status: trusted({ $in: from }) },
    {
      $set: {
        status: event.status,
        ...(event.status === "delivered" ? { deliveredAt: event.at } : {}),
      },
      $push: {
        events: { status: event.status, at: event.at, location: event.location, note: event.note },
      },
    },
    { returnDocument: "after" }
  ).lean<ShipmentDoc>()
  if (!moved) return false

  const order = await Order.findByIdAndUpdate(
    shipment.orderId,
    {
      $set: {
        fulfillmentStatus: FULFILLMENT_FOR[event.status],
        ...(event.status === "delivered" ? { deliveredAt: event.at } : {}),
      },
    },
    { returnDocument: "after" }
  ).lean<OrderDoc>()
  if (!order) return true

  if (
    event.status === "picked_up" ||
    (event.status === "in_transit" && shipment.status === "created")
  )
    await enqueueEmail(
      orderShippedMessage({
        to: order.email,
        name: order.shippingAddress.fullName,
        orderNumber: order.orderNumber,
        courier: shipment.courier,
        awb: shipment.awb,
        trackingUrl: shipment.trackingUrl,
      }),
      `order-shipped:${order._id}:${shipment.awb}`
    )
  if (event.status === "delivered") {
    const settings = await getCommerceSettings()
    await enqueueEmail(
      orderDeliveredMessage({
        to: order.email,
        name: order.shippingAddress.fullName,
        orderNumber: order.orderNumber,
        returnWindowDays: settings.returnWindowDays,
      }),
      `order-delivered:${order._id}`
    )
  }
  return true
}

/** Asks the courier for the history of every shipment still moving, so a missed webhook is caught up. */
export async function syncActiveShipments(limit = 30): Promise<number> {
  await connectDb()
  const due = await Shipment.find({ status: trusted({ $in: ACTIVE }) })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean<ShipmentDoc[]>()
  let moved = 0
  for (const shipment of due) {
    try {
      const events = await getShippingProvider().getTracking(shipment.awb)
      for (const event of events) if (await applyTrackingEvent(shipment.awb, event)) moved += 1
      await Shipment.updateOne({ _id: shipment._id }, { $set: { updatedAt: new Date() } })
    } catch (error) {
      logger.warn(
        { event: "shipping.sync_failed", errorName: (error as Error).name },
        "Tracking sync failed"
      )
    }
  }
  return moved
}

export type ShippingWebhookResult = { status: 200 | 400 | 401 | 500; body: Record<string, unknown> }

export async function handleShippingWebhook(input: {
  rawBody: string
  headers: Headers
}): Promise<ShippingWebhookResult> {
  const provider = getShippingProvider()
  if (!provider.verifyWebhook(input.headers))
    return { status: 401, body: { error: "unauthorized" } }
  let body: unknown
  try {
    body = JSON.parse(input.rawBody)
  } catch {
    return { status: 400, body: { error: "invalid body" } }
  }
  const parsed = provider.parseWebhook(body)
  if (!parsed) return { status: 200, body: { ignored: true } } // a message we do not use
  await connectDb()
  try {
    await WebhookEvent.create({
      provider: "shiprocket",
      eventId: parsed.eventId.slice(0, 120),
      type: parsed.event.status,
    })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    const seen = await WebhookEvent.findOne({
      provider: "shiprocket",
      eventId: parsed.eventId.slice(0, 120),
    }).lean()
    if (seen && seen.status !== "failed" && seen.status !== "received")
      return { status: 200, body: { duplicate: true } }
  }
  try {
    await applyTrackingEvent(parsed.awb, parsed.event)
    await WebhookEvent.updateOne(
      { provider: "shiprocket", eventId: parsed.eventId.slice(0, 120) },
      { $set: { status: "processed" } }
    )
    return { status: 200, body: { received: true } }
  } catch (error) {
    await WebhookEvent.updateOne(
      { provider: "shiprocket", eventId: parsed.eventId.slice(0, 120) },
      { $set: { status: "failed", error: (error as Error).name.slice(0, 300) } }
    )
    return { status: 500, body: { error: "processing failed" } }
  }
}

// ------------------------------------------------------------------ after delivery

/** Orders delivered long enough ago, with no open return, become completed. */
export async function closeReturnWindows(now = new Date(), limit = 100): Promise<number> {
  await connectDb()
  const { returnWindowDays } = await getCommerceSettings()
  const cutoff = new Date(now.getTime() - returnWindowDays * 24 * 3600 * 1000)
  const due = await Order.find({
    status: "processing",
    fulfillmentStatus: "delivered",
    deliveredAt: trusted({ $lte: cutoff }),
  })
    .limit(limit)
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }[]>()
  let closed = 0
  for (const o of due) {
    const open = await ReturnRequest.exists({
      orderId: o._id,
      status: trusted({ $in: ["requested", "approved", "received"] }),
    })
    if (open) continue
    const { changed } = await transitionOrder(String(o._id), "return_window.closed", {
      actor: "system",
    })
    if (changed) closed += 1
  }
  return closed
}

export type ShipmentView = {
  courier: string
  awb: string
  status: ShipmentStatus
  trackingUrl?: string
  labelUrl?: string
  events: { status: ShipmentStatus; at: string; location?: string }[]
}

export async function getShipmentView(
  orderId: string,
  includeLabel = false
): Promise<ShipmentView | null> {
  await connectDb()
  const shipment =
    (await activeShipment(orderId)) ??
    (await Shipment.findOne({ orderId: oid(orderId) })
      .sort({ createdAt: -1 })
      .lean<ShipmentDoc>())
  if (!shipment) return null
  return {
    courier: shipment.courier,
    awb: shipment.awb,
    status: shipment.status,
    trackingUrl: shipment.trackingUrl,
    ...(includeLabel ? { labelUrl: shipment.labelUrl } : {}),
    events: shipment.events.map((e) => ({
      status: e.status,
      at: e.at.toISOString(),
      location: e.location,
    })),
  }
}
