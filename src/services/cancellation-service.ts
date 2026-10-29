import "server-only"
import mongoose from "mongoose"
import { orderCancelledMessage } from "@/lib/email/templates"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { formatPaise } from "@/lib/money"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { Order, type OrderDoc } from "@/models/order"
import { Shipment } from "@/models/shipment"
import { recordAudit } from "@/services/audit-service"
import { releaseCoupon } from "@/services/coupon-service"
import { adjustStock } from "@/services/inventory-service"
import { enqueueEmail } from "@/services/job-service"
import { transitionOrder } from "@/services/order-service"
import { refundOrder } from "@/services/refund-service"

const trusted = mongoose.trusted

/**
 * Cancels a paid order that has not been collected by a courier: the stock goes back on the shelf, the
 * coupon use is returned and the whole payment is refunded. Staff need `orders:cancel`; a customer may
 * cancel their own order only while it is still "confirmed" (not yet being prepared or booked).
 */
export async function cancelPaidOrder(
  actor: Actor,
  orderNumber: string,
  options: { reason: string; asCustomer?: boolean }
): Promise<void> {
  await connectDb()
  const order = await Order.findOne({ orderNumber }).lean<OrderDoc>()
  // A customer asking for someone else's order is told it does not exist.
  if (!order || (options.asCustomer && String(order.userId) !== actor.id))
    throw new NotFoundError("We could not find that order.")
  if (options.asCustomer) {
    if (order.status !== "confirmed" || order.shipmentClaim)
      throw new ValidationError(
        "This order is already being prepared and can no longer be cancelled here. Please contact us."
      )
  } else {
    assertPermission(actor, "orders:cancel")
    if (!options.reason.trim()) throw new ValidationError("Say why the order is being cancelled.")
  }
  if (order.paymentStatus !== "paid")
    throw new ValidationError("Only a paid order can be cancelled this way.")
  const collected = await Shipment.exists({
    orderId: order._id,
    status: trusted({ $in: ["picked_up", "in_transit", "out_for_delivery", "delivered"] }),
  })
  if (collected) throw new ValidationError("The courier already has this parcel.")
  const booked = await Shipment.exists({ orderId: order._id, status: "created" })
  if (booked) throw new ValidationError("Cancel the shipment first.")

  const { changed } = await transitionOrder(String(order._id), "admin.cancel", {
    actor: options.asCustomer ? `user:${actor.id}` : `staff:${actor.id}`,
    note: options.reason.slice(0, 200),
    set: { cancelledAt: new Date(), cancelReason: options.reason.slice(0, 300) },
  })
  if (!changed) throw new ValidationError("This order can no longer be cancelled.")

  try {
    for (const item of order.items)
      await adjustStock({
        variantId: item.variantId,
        delta: item.qty,
        type: "restock",
        reason: `Order ${order.orderNumber} cancelled`,
        idempotencyKey: `cancel-restock:${order._id}:${item.variantId}`,
        orderId: order._id,
        actorId: actor.id,
      })
    await releaseCoupon(String(order._id))
    await refundOrder({
      orderId: String(order._id),
      amountPaise: order.pricing.totalPaise - order.refundedPaise,
      reason: `Order cancelled: ${options.reason}`.slice(0, 300),
      idempotencyKey: `cancel:${order._id}`,
      actorId: actor.id,
    })
    await enqueueEmail(
      orderCancelledMessage({
        to: order.email,
        name: order.shippingAddress.fullName,
        orderNumber: order.orderNumber,
        refund: formatPaise(order.pricing.totalPaise - order.refundedPaise),
      }),
      `order-cancelled:${order._id}`
    )
  } catch (error) {
    // The order is cancelled; the money part did not finish. Say so loudly so staff finish it by hand.
    logger.error(
      {
        event: "order.cancel_followup_failed",
        orderId: String(order._id),
        errorName: (error as Error).name,
      },
      "Cancelled, but the refund or restock did not complete"
    )
    await recordAudit({
      action: "order.cancel_followup_failed",
      actor,
      entityType: "order",
      entityId: String(order._id),
    })
    throw error
  }
  await recordAudit({
    action: options.asCustomer ? "order.cancelled_by_customer" : "order.cancelled",
    actor,
    entityType: "order",
    entityId: String(order._id),
    details: { reason: options.reason.slice(0, 100) },
  })
}
