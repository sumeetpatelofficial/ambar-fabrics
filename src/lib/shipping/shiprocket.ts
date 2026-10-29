import { AppError } from "@/lib/errors"
import { safeEqual } from "@/lib/security/tokens"
import type {
  CreateShipmentInput,
  ShipmentStatus,
  ShippingProvider,
  TrackingEvent,
} from "@/lib/shipping/types"

type Config = {
  email: string
  password: string
  pickupLocation: string
  originPincode: string
  webhookToken?: string
  baseUrl?: string
}

const BASE = "https://apiv2.shiprocket.in/v1/external"

/** Shiprocket's status wording, as text, to ours. Anything unrecognised is ignored rather than guessed at. */
export function mapShiprocketStatus(text: string | undefined): ShipmentStatus | null {
  const s = (text ?? "").trim().toUpperCase().replace(/[_-]+/g, " ")
  if (!s) return null
  if (s.includes("RTO") && s.includes("DELIVERED")) return "rto_delivered"
  if (s.includes("RTO")) return "rto_initiated"
  if (s.includes("OUT FOR DELIVERY")) return "out_for_delivery"
  if (s === "DELIVERED") return "delivered"
  if (s.includes("CANCEL")) return "cancelled"
  if (s.includes("PICKED UP") || s === "PICKUP DONE") return "picked_up"
  if (
    s.includes("IN TRANSIT") ||
    s === "SHIPPED" ||
    s.includes("REACHED") ||
    s.includes("DISPATCH")
  )
    return "in_transit"
  if (s.includes("PICKUP") || s === "NEW" || s.includes("AWB")) return "created"
  return null
}

/** Shiprocket times look like "2026-10-14 12:30:00" in Indian time. */
function parseTime(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(value.trim())
  const date = new Date(m ? `${m[1]}T${m[2]}${m[2]!.length === 5 ? ":00" : ""}+05:30` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Shiprocket over its REST API (no SDK). Not yet run against a real account: written from Shiprocket's
 * documentation and exercised against mocked responses only.
 */
export function createShiprocketProvider(
  config: Config,
  fetchImpl: typeof fetch = fetch
): ShippingProvider {
  const base = config.baseUrl ?? BASE
  let token: { value: string; expires: number } | null = null

  async function raw<T>(method: "GET" | "POST", path: string, body?: unknown, auth = true) {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Bearer ${await login()}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new AppError("SHIPPING_UNAVAILABLE", "The shipping service is not responding.", 503)
    }
    if (response.status === 401 && auth) token = null
    if (!response.ok)
      throw new AppError("SHIPPING_ERROR", "The shipping service refused that request.", 502, {
        status: response.status,
      })
    return (await response.json()) as T
  }

  async function login(): Promise<string> {
    if (token && token.expires > Date.now()) return token.value
    const result = await raw<{ token?: string }>(
      "POST",
      "/auth/login",
      { email: config.email, password: config.password },
      false
    )
    if (!result.token)
      throw new AppError("SHIPPING_ERROR", "The shipping service refused our sign-in.", 502)
    // Shiprocket tokens last 10 days; renew a day early.
    token = { value: result.token, expires: Date.now() + 9 * 24 * 3600 * 1000 }
    return token.value
  }

  return {
    name: "shiprocket",
    async checkServiceability({ pincode, weightGrams }) {
      const params = new URLSearchParams({
        pickup_postcode: config.originPincode,
        delivery_postcode: pincode,
        weight: (Math.max(weightGrams, 100) / 1000).toFixed(2),
        cod: "0",
      })
      const result = await raw<{
        data?: {
          available_courier_companies?: {
            rate?: number
            estimated_delivery_days?: string | number
          }[]
        }
      }>("GET", `/courier/serviceability/?${params}`)
      const couriers = result.data?.available_courier_companies ?? []
      if (couriers.length === 0) return { serviceable: false }
      const cheapest = Math.min(...couriers.map((c) => Number(c.rate ?? Infinity)))
      const days = Math.min(...couriers.map((c) => Number(c.estimated_delivery_days ?? Infinity)))
      return {
        serviceable: true,
        ...(Number.isFinite(days) ? { etaDays: days } : {}),
        ...(Number.isFinite(cheapest) ? { costPaise: Math.round(cheapest * 100) } : {}),
      }
    },

    async createShipment(input: CreateShipmentInput) {
      const [first = "", ...rest] = input.customer.name.trim().split(/\s+/)
      const created = await raw<{ order_id?: number; shipment_id?: number }>(
        "POST",
        "/orders/create/adhoc",
        {
          order_id: input.orderNumber,
          order_date: input.placedAt.toISOString().slice(0, 16).replace("T", " "),
          pickup_location: config.pickupLocation,
          billing_customer_name: first,
          billing_last_name: rest.join(" "),
          billing_address: input.customer.line1,
          billing_address_2: input.customer.line2 ?? "",
          billing_city: input.customer.city,
          billing_pincode: input.customer.pincode,
          billing_state: input.customer.state,
          billing_country: "India",
          billing_email: input.customer.email,
          billing_phone: input.customer.phone,
          shipping_is_billing: true,
          order_items: input.items.map((i) => ({
            name: i.name,
            sku: i.sku,
            units: i.qty,
            selling_price: (i.unitPricePaise / 100).toFixed(2),
          })),
          payment_method: "Prepaid",
          sub_total: input.subtotalPaise / 100,
          length: Math.max(1, Math.ceil(input.parcel.lengthMm / 10)),
          breadth: Math.max(1, Math.ceil(input.parcel.widthMm / 10)),
          height: Math.max(1, Math.ceil(input.parcel.heightMm / 10)),
          weight: Math.max(input.parcel.weightGrams, 100) / 1000,
        }
      )
      if (!created.shipment_id || !created.order_id)
        throw new AppError(
          "SHIPPING_ERROR",
          "The shipping service did not create the shipment.",
          502
        )
      const awbResult = await raw<{
        response?: { data?: { awb_code?: string; courier_name?: string } }
      }>("POST", "/courier/assign/awb", { shipment_id: created.shipment_id })
      const awb = awbResult.response?.data?.awb_code
      if (!awb)
        throw new AppError("SHIPPING_ERROR", "No courier could be assigned to this shipment.", 502)
      const label = await raw<{ label_url?: string }>("POST", "/courier/generate/label", {
        shipment_id: [created.shipment_id],
      }).catch(() => ({ label_url: undefined }))
      return {
        // Cancelling needs the order id; the shipment id is kept with it.
        providerOrderId: `${created.order_id}:${created.shipment_id}`,
        awb,
        courier: awbResult.response?.data?.courier_name ?? "Courier",
        trackingUrl: `https://shiprocket.co/tracking/${awb}`,
        labelUrl: label.label_url,
      }
    },

    async cancelShipment({ awb }) {
      await raw("POST", "/orders/cancel/shipment/awbs", { awbs: [awb] })
    },

    async getTracking(awb) {
      const result = await raw<{
        tracking_data?: {
          shipment_track_activities?: {
            date?: string
            status?: string
            activity?: string
            location?: string
          }[]
        }
      }>("GET", `/courier/track/awb/${encodeURIComponent(awb)}`)
      const events: TrackingEvent[] = []
      for (const a of result.tracking_data?.shipment_track_activities ?? []) {
        const status = mapShiprocketStatus(a.status ?? a.activity)
        const at = parseTime(a.date)
        if (status && at) events.push({ status, at, location: a.location, note: a.activity })
      }
      return events.sort((x, y) => x.at.getTime() - y.at.getTime())
    },

    verifyWebhook(headers) {
      const given = headers.get("x-api-key") ?? ""
      return Boolean(config.webhookToken) && safeEqual(given, config.webhookToken!)
    },

    parseWebhook(body) {
      if (!body || typeof body !== "object") return null
      const b = body as Record<string, unknown>
      const awb = typeof b.awb === "string" ? b.awb : undefined
      const status = mapShiprocketStatus(
        typeof b.current_status === "string" ? b.current_status : undefined
      )
      const at = parseTime(b.current_timestamp)
      if (!awb || !status || !at) return null
      return { awb, eventId: `${awb}:${status}:${at.toISOString()}`, event: { status, at } }
    },
  }
}
