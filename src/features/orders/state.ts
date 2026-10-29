import type { OrderStatus, PaymentStatus } from "@/models/order"

/**
 * The only ways an order's status can change. Services call `transitionOrder` with an event name; nothing
 * writes `status` directly. An event not allowed from the order's current status changes nothing.
 */
export const ORDER_EVENTS = {
  "payment.captured": {
    from: ["pending_payment"],
    to: "confirmed",
    paymentStatus: "paid",
  },
  // Paid after the hold ran out, and the stock could be taken again.
  "payment.captured_late": { from: ["expired"], to: "confirmed", paymentStatus: "paid" },
  // Paid, but the order cannot be fulfilled (no stock, wrong amount, already cancelled): a refund follows.
  "payment.unfulfillable": {
    from: ["pending_payment", "expired", "cancelled"],
    to: "needs_attention",
    paymentStatus: "paid",
  },
  "payment.failed": { from: ["pending_payment"], to: "pending_payment", paymentStatus: "failed" },
  expire: { from: ["pending_payment"], to: "expired" },
  "customer.cancel": { from: ["pending_payment"], to: "cancelled" },
  "admin.cancel": { from: ["confirmed", "processing"], to: "cancelled" },
  "admin.process": { from: ["confirmed"], to: "processing" },
  // A shipment exists: the order is being fulfilled. A second shipment (a replacement) keeps it there.
  "shipment.created": { from: ["confirmed", "processing"], to: "processing" },
  // A sale made in the shop is created already completed; voiding it (a mistake) cancels it.
  "store.void": { from: ["completed"], to: "cancelled", paymentStatus: "refunded" },
  // The return window has passed after delivery.
  "return_window.closed": { from: ["processing"], to: "completed" },
} as const satisfies Record<
  string,
  { from: readonly OrderStatus[]; to: OrderStatus; paymentStatus?: PaymentStatus }
>

export type OrderEvent = keyof typeof ORDER_EVENTS

export const canTransition = (from: OrderStatus, event: OrderEvent): boolean =>
  (ORDER_EVENTS[event].from as readonly OrderStatus[]).includes(from)
