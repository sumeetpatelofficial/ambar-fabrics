import type { ShipmentStatus } from "@/lib/shipping/types"
import type { FulfillmentStatus } from "@/models/order"

/** A shipment only moves forward. Late or repeated updates are ignored, and a finished shipment is final. */
const FORWARD: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  created: [
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "rto_initiated",
    "cancelled",
  ],
  picked_up: ["in_transit", "out_for_delivery", "delivered", "rto_initiated"],
  in_transit: ["out_for_delivery", "delivered", "rto_initiated"],
  out_for_delivery: ["delivered", "rto_initiated"],
  rto_initiated: ["rto_delivered"],
  delivered: [],
  rto_delivered: [],
  cancelled: [],
}

export function canMoveShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return FORWARD[from].includes(to)
}

export const isFinalShipment = (s: ShipmentStatus) => FORWARD[s].length === 0

/** What the order's fulfilment status becomes for each shipment status. */
export const FULFILLMENT_FOR: Record<ShipmentStatus, FulfillmentStatus> = {
  created: "packed",
  picked_up: "shipped",
  in_transit: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  rto_initiated: "shipped",
  rto_delivered: "rto",
  cancelled: "unfulfilled",
}

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  created: "Packed, waiting for pickup",
  picked_up: "Picked up",
  in_transit: "On its way",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  rto_initiated: "Returning to us",
  rto_delivered: "Returned to us",
  cancelled: "Shipment cancelled",
}
