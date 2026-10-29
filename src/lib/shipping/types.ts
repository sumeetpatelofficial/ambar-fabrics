/** What the shop needs from a courier aggregator. Shiprocket is the real one; the mock is for development and tests. */
export type ProviderName = "shiprocket" | "mock"

export const SHIPMENT_STATUSES = [
  "created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "rto_initiated",
  "rto_delivered",
  "cancelled",
] as const
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export type Parcel = { weightGrams: number; lengthMm: number; widthMm: number; heightMm: number }

export type ServiceabilityResult = {
  serviceable: boolean
  /** Fastest estimate in days, when the courier gives one. */
  etaDays?: number
  /** Cheapest courier's charge to us (not what the customer pays), in paise. */
  costPaise?: number
}

export type TrackingEvent = { status: ShipmentStatus; at: Date; location?: string; note?: string }

export type CreateShipmentInput = {
  orderNumber: string
  placedAt: Date
  paymentMethod: "prepaid"
  parcel: Parcel
  subtotalPaise: number
  customer: {
    name: string
    phone: string
    email: string
    line1: string
    line2?: string
    city: string
    state: string
    pincode: string
  }
  items: { name: string; sku: string; qty: number; unitPricePaise: number }[]
}

export type CreatedShipment = {
  providerOrderId: string
  awb: string
  courier: string
  trackingUrl?: string
  labelUrl?: string
}

export interface ShippingProvider {
  readonly name: ProviderName
  checkServiceability(input: {
    pincode: string
    weightGrams: number
  }): Promise<ServiceabilityResult>
  createShipment(input: CreateShipmentInput): Promise<CreatedShipment>
  cancelShipment(input: { providerOrderId: string; awb: string }): Promise<void>
  getTracking(awb: string): Promise<TrackingEvent[]>
  /** True when the webhook request really came from the provider. */
  verifyWebhook(headers: Headers): boolean
  /** Reads a webhook body into one tracking update, or null when it is not one we use. */
  parseWebhook(body: unknown): { awb: string; eventId: string; event: TrackingEvent } | null
}
