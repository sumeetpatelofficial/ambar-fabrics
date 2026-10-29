import { randomBytes } from "node:crypto"
import type { ShippingProvider, TrackingEvent } from "@/lib/shipping/types"

/** Shared secret for the stand-in's webhooks. Development and tests only. */
export const MOCK_SHIPPING_TOKEN = "mock-shipping-token-not-for-production"

const tracking = new Map<string, TrackingEvent[]>()

/** Development and test stand-in. PINs starting with 9 are not served, so "unserviceable" can be tried. */
export function createMockShipping(): ShippingProvider {
  return {
    name: "mock",
    async checkServiceability({ pincode }) {
      return pincode.startsWith("9")
        ? { serviceable: false }
        : { serviceable: true, etaDays: 4, costPaise: 6500 }
    },
    async createShipment(input) {
      const awb = `MOCKAWB${randomBytes(5).toString("hex").toUpperCase()}`
      tracking.set(awb, [{ status: "created", at: input.placedAt }])
      return {
        providerOrderId: `mock_${randomBytes(6).toString("hex")}`,
        awb,
        courier: "Mock Express",
        trackingUrl: `https://tracking.example.com/${awb}`,
        labelUrl: `https://labels.example.com/${awb}.pdf`,
      }
    },
    async cancelShipment({ awb }) {
      tracking.delete(awb)
    },
    async getTracking(awb) {
      return tracking.get(awb) ?? []
    },
    verifyWebhook: (headers) => headers.get("x-api-key") === MOCK_SHIPPING_TOKEN,
    parseWebhook: parseShiprocketLikeWebhook,
  }
}

/** Test and development hook: adds a tracking event the stand-in courier should report. */
export function recordMockTracking(awb: string, event: TrackingEvent) {
  tracking.set(awb, [...(tracking.get(awb) ?? []), event])
}

function parseShiprocketLikeWebhook(body: unknown) {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  const awb = typeof b.awb === "string" ? b.awb : undefined
  const status = typeof b.status === "string" ? b.status : undefined
  const at = typeof b.at === "string" ? new Date(b.at) : undefined
  const eventId = typeof b.event_id === "string" ? b.event_id : undefined
  if (!awb || !status || !at || Number.isNaN(at.getTime()) || !eventId) return null
  const known = [
    "created",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "rto_initiated",
    "rto_delivered",
    "cancelled",
  ]
  if (!known.includes(status)) return null
  return { awb, eventId, event: { status: status as TrackingEvent["status"], at } }
}
