import "server-only"
import { connectDb } from "@/lib/db/mongoose"
import { formatQuantity } from "@/lib/measure"
import { Order, type OrderDoc } from "@/models/order"
import { getShipmentView, type ShipmentView } from "@/services/shipping-service"

export type TrackedOrder = {
  orderNumber: string
  status: OrderDoc["status"]
  paymentStatus: OrderDoc["paymentStatus"]
  fulfillmentStatus: OrderDoc["fulfillmentStatus"]
  placedAt?: string
  items: { name: string; quantity: string }[]
  shipment: ShipmentView | null
}

/**
 * Status for a visitor who knows the order number and the email on it. The answer holds no address,
 * phone number or prices, and a wrong number and a wrong email are indistinguishable (both return null).
 */
export async function trackOrder(orderNumber: string, email: string): Promise<TrackedOrder | null> {
  await connectDb()
  const order = await Order.findOne({
    orderNumber: orderNumber.trim().toUpperCase(),
    email: email.trim().toLowerCase(),
  }).lean<OrderDoc>()
  if (!order || order.status === "pending_payment" || order.status === "expired") return null
  const shipment = await getShipmentView(String(order._id))
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    ...(order.placedAt ? { placedAt: order.placedAt.toISOString() } : {}),
    items: order.items.map((i) => ({ name: i.name, quantity: formatQuantity(i.unit, i.qty) })),
    shipment: shipment ? { ...shipment, labelUrl: undefined } : null,
  }
}
