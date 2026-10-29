import type { OrderView } from "@/services/order-service"

/** Plain words for an order's state, for the customer. */
export function statusLabel(
  order: Pick<OrderView, "status" | "paymentStatus"> & { fulfillmentStatus?: string }
): {
  label: string
  tone: "good" | "wait" | "bad"
} {
  if (order.paymentStatus === "refunded") return { label: "Refunded", tone: "bad" }
  const stage: Record<string, string> = {
    packed: "Packed",
    shipped: "Shipped",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    returned: "Returned",
    rto: "Returned to us",
  }
  if (order.fulfillmentStatus && stage[order.fulfillmentStatus] && order.status !== "cancelled")
    return { label: stage[order.fulfillmentStatus]!, tone: "good" }
  switch (order.status) {
    case "pending_payment":
      return { label: "Waiting for payment", tone: "wait" }
    case "confirmed":
      return { label: "Confirmed", tone: "good" }
    case "processing":
      return { label: "Being prepared", tone: "good" }
    case "completed":
      return { label: "Completed", tone: "good" }
    case "cancelled":
      return { label: "Cancelled", tone: "bad" }
    case "expired":
      return { label: "Expired", tone: "bad" }
    case "needs_attention":
      return { label: "We are looking into this order", tone: "wait" }
  }
}
