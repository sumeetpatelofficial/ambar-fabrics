import { describe, expect, it, vi } from "vitest"
import { units } from "@/lib/measure"
import { lineWeightGrams, parcelFor } from "@/lib/shipping/parcel"
import { createShiprocketProvider, mapShiprocketStatus } from "@/lib/shipping/shiprocket"
import { canMoveShipment, FULFILLMENT_FOR, isFinalShipment } from "@/lib/shipping/status"
import { SHIPMENT_STATUSES } from "@/lib/shipping/types"

describe("shipment status rules", () => {
  it("only moves forward and never leaves a final state", () => {
    expect(canMoveShipment("created", "in_transit")).toBe(true)
    expect(canMoveShipment("in_transit", "picked_up")).toBe(false)
    expect(canMoveShipment("delivered", "rto_initiated")).toBe(false)
    expect(canMoveShipment("rto_initiated", "delivered")).toBe(false)
    expect(canMoveShipment("picked_up", "cancelled")).toBe(false)
    for (const s of SHIPMENT_STATUSES) expect(canMoveShipment(s, s)).toBe(false)
    for (const s of ["delivered", "rto_delivered", "cancelled"] as const)
      expect(isFinalShipment(s)).toBe(true)
  })
  it("maps every status to an order fulfilment status", () => {
    for (const s of SHIPMENT_STATUSES) expect(FULFILLMENT_FOR[s]).toBeTruthy()
  })
})

describe("parcel estimates", () => {
  it("weighs fabric by the metre and pieces each", () => {
    expect(lineWeightGrams(units.perMetre(), 2500)).toBe(625)
    expect(lineWeightGrams(units.perMetre(), 2500, 120)).toBe(300)
    expect(lineWeightGrams(units.each(), 2)).toBe(600)
    expect(lineWeightGrams(units.each(), 2, 450)).toBe(900)
  })
  it("never builds a parcel under 100 g and grows in height with weight", () => {
    expect(parcelFor(10).weightGrams).toBe(100)
    expect(parcelFor(100).heightMm).toBe(20)
    expect(parcelFor(1200).heightMm).toBe(60)
    expect(parcelFor(999_999).heightMm).toBe(300)
  })
})

describe("Shiprocket status wording", () => {
  it("understands the common statuses and ignores the rest", () => {
    expect(mapShiprocketStatus("DELIVERED")).toBe("delivered")
    expect(mapShiprocketStatus("Out For Delivery")).toBe("out_for_delivery")
    expect(mapShiprocketStatus("PICKED UP")).toBe("picked_up")
    expect(mapShiprocketStatus("IN TRANSIT")).toBe("in_transit")
    expect(mapShiprocketStatus("RTO INITIATED")).toBe("rto_initiated")
    expect(mapShiprocketStatus("RTO DELIVERED")).toBe("rto_delivered")
    expect(mapShiprocketStatus("CANCELED")).toBe("cancelled")
    expect(mapShiprocketStatus("PICKUP SCHEDULED")).toBe("created")
    expect(mapShiprocketStatus("something new")).toBeNull()
    expect(mapShiprocketStatus(undefined)).toBeNull()
  })
})

describe("Shiprocket adapter (against recorded-shape responses)", () => {
  const config = {
    email: "shop@example.com",
    password: "pw",
    pickupLocation: "Primary",
    originPincode: "395003",
    webhookToken: "webhook-token-0123456789",
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  function provider(routes: Record<string, unknown>) {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u.endsWith("/auth/login")) return json({ token: "tok" })
      const key = Object.keys(routes).find((k) => u.includes(k))
      return key ? json(routes[key]) : json({}, 404)
    }) as unknown as typeof fetch
    return { p: createShiprocketProvider(config, fetchImpl), calls }
  }

  it("signs in once and sends the token", async () => {
    const { p, calls } = provider({
      "/courier/serviceability": {
        data: {
          available_courier_companies: [
            { rate: 65, estimated_delivery_days: "3" },
            { rate: 80, estimated_delivery_days: "2" },
          ],
        },
      },
    })
    expect(await p.checkServiceability({ pincode: "110001", weightGrams: 600 })).toEqual({
      serviceable: true,
      etaDays: 2,
      costPaise: 6500,
    })
    await p.checkServiceability({ pincode: "110001", weightGrams: 600 })
    expect(calls.filter((c) => c.url.endsWith("/auth/login"))).toHaveLength(1)
    expect((calls.at(-1)!.init!.headers as Record<string, string>).Authorization).toBe("Bearer tok")
    expect(calls.at(-1)!.url).toContain("pickup_postcode=395003")
    expect(calls.at(-1)!.url).toContain("weight=0.60")
  })

  it("says not serviceable when no courier is available", async () => {
    const { p } = provider({
      "/courier/serviceability": { data: { available_courier_companies: [] } },
    })
    expect(await p.checkServiceability({ pincode: "110001", weightGrams: 500 })).toEqual({
      serviceable: false,
    })
  })

  it("creates an order, assigns a courier and fetches the label", async () => {
    const { p, calls } = provider({
      "/orders/create/adhoc": { order_id: 11, shipment_id: 22 },
      "/courier/assign/awb": {
        response: { data: { awb_code: "AWB123", courier_name: "Delhivery" } },
      },
      "/courier/generate/label": { label_url: "https://labels.example/1.pdf" },
    })
    const made = await p.createShipment({
      orderNumber: "AM-2610-000001",
      placedAt: new Date("2026-10-14T06:00:00Z"),
      paymentMethod: "prepaid",
      parcel: parcelFor(625),
      subtotalPaise: 45000,
      customer: {
        name: "Meera Shah",
        phone: "9876543210",
        email: "m@example.com",
        line1: "12 Ring Road",
        city: "Surat",
        state: "Gujarat",
        pincode: "395007",
      },
      items: [{ name: "Handloom cotton", sku: "HC-1", qty: 1, unitPricePaise: 45000 }],
    })
    expect(made).toMatchObject({
      awb: "AWB123",
      courier: "Delhivery",
      providerOrderId: "11:22",
      labelUrl: "https://labels.example/1.pdf",
    })
    const create = JSON.parse(
      String(calls.find((c) => c.url.includes("/orders/create/adhoc"))!.init!.body)
    )
    expect(create).toMatchObject({
      pickup_location: "Primary",
      payment_method: "Prepaid",
      sub_total: 450,
      weight: 0.625,
      billing_last_name: "Shah",
    })
  })

  it("fails clearly when no courier can be assigned or the service refuses", async () => {
    const { p } = provider({
      "/orders/create/adhoc": { order_id: 1, shipment_id: 2 },
      "/courier/assign/awb": { response: { data: {} } },
    })
    await expect(
      p.createShipment({
        orderNumber: "A",
        placedAt: new Date(),
        paymentMethod: "prepaid",
        parcel: parcelFor(100),
        subtotalPaise: 100,
        customer: {
          name: "A",
          phone: "9876543210",
          email: "a@example.com",
          line1: "x",
          city: "y",
          state: "z",
          pincode: "395003",
        },
        items: [],
      })
    ).rejects.toThrow(/courier/i)
    await expect(provider({}).p.getTracking("X")).rejects.toThrow(/refused/i)
  })

  it("reads tracking history oldest first and skips lines it cannot place", async () => {
    const { p } = provider({
      "/courier/track/awb": {
        tracking_data: {
          shipment_track_activities: [
            { date: "2026-10-15 10:00:00", status: "DELIVERED", location: "Surat" },
            { date: "2026-10-14 09:00:00", status: "PICKED UP" },
            { date: "2026-10-14 08:00:00", status: "???" },
          ],
        },
      },
    })
    const events = await p.getTracking("AWB1")
    expect(events.map((e) => e.status)).toEqual(["picked_up", "delivered"])
    expect(events[0]!.at.toISOString()).toBe("2026-10-14T03:30:00.000Z")
  })

  it("checks the webhook token and reads a delivery message", () => {
    const { p } = provider({})
    expect(p.verifyWebhook(new Headers({ "x-api-key": "webhook-token-0123456789" }))).toBe(true)
    expect(p.verifyWebhook(new Headers({ "x-api-key": "nope" }))).toBe(false)
    expect(p.verifyWebhook(new Headers())).toBe(false)
    const parsed = p.parseWebhook({
      awb: "AWB1",
      current_status: "Delivered",
      current_timestamp: "2026-10-15 10:00:00",
    })
    expect(parsed).toMatchObject({ awb: "AWB1", event: { status: "delivered" } })
    expect(p.parseWebhook({ awb: "AWB1", current_status: "weird" })).toBeNull()
    expect(p.parseWebhook("junk")).toBeNull()
  })

  it("refuses every webhook when no token is configured", () => {
    const open = createShiprocketProvider({ ...config, webhookToken: undefined })
    expect(open.verifyWebhook(new Headers({ "x-api-key": "" }))).toBe(false)
  })
})
