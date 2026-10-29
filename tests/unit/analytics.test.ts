import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CONSENT_MAX_AGE_MS,
  CONSENT_VERSION,
  isGaCookie,
  parseConsent,
  serializeConsent,
  shouldAsk,
} from "@/lib/analytics/consent"
import { displayQuantity, events, lineItem, productItem, rupees } from "@/lib/analytics/events"
import { claimPurchase, PURCHASE_KEY } from "@/lib/analytics/purchase-dedupe"
import { resetTracking, setTracking, track } from "@/lib/analytics/track"
import { units } from "@/lib/measure"

const NOW = 1_800_000_000_000

describe("consent", () => {
  it("round-trips a choice", () => {
    expect(parseConsent(serializeConsent("granted", NOW), NOW)).toEqual({
      choice: "granted",
      at: NOW,
      version: CONSENT_VERSION,
    })
    expect(parseConsent(serializeConsent("denied", NOW), NOW)?.choice).toBe("denied")
  })

  it("treats anything odd as not answered", () => {
    for (const raw of [
      null,
      "",
      "granted",
      "{",
      "[]",
      "null",
      JSON.stringify({ choice: "maybe", at: NOW, version: CONSENT_VERSION }),
      JSON.stringify({ choice: "granted", at: "now", version: CONSENT_VERSION }),
      JSON.stringify({ choice: "granted", at: NOW, version: CONSENT_VERSION + 1 }),
      JSON.stringify({ choice: "granted", at: NOW + 10 * 86_400_000, version: CONSENT_VERSION }),
      JSON.stringify({ choice: "granted", version: CONSENT_VERSION }),
    ])
      expect(parseConsent(raw, NOW), String(raw)).toBeNull()
  })

  it("asks again after a year", () => {
    const raw = serializeConsent("granted", NOW)
    expect(parseConsent(raw, NOW + CONSENT_MAX_AGE_MS)).not.toBeNull()
    expect(parseConsent(raw, NOW + CONSENT_MAX_AGE_MS + 1)).toBeNull()
  })

  it("only asks when analytics is set up and nothing is answered", () => {
    expect(shouldAsk(undefined, null)).toBe(false)
    expect(shouldAsk("", null)).toBe(false)
    expect(shouldAsk("G-ABC123", null)).toBe(true)
    expect(shouldAsk("G-ABC123", { choice: "denied", at: NOW, version: CONSENT_VERSION })).toBe(
      false
    )
  })

  it("knows Google's cookies and leaves the shop's own alone", () => {
    for (const n of ["_ga", "_ga_ABC123", "_gid", "_gat_gtag_G_X"]) expect(isGaCookie(n)).toBe(true)
    for (const n of ["authjs.session-token", "af-bag", "gallery", "_game"])
      expect(isGaCookie(n)).toBe(false)
  })
})

describe("event data", () => {
  const metre = units.perMetre()

  it("converts paise to rupees exactly", () => {
    expect(rupees(12345)).toBe(123.45)
    expect(rupees(0)).toBe(0)
    expect(rupees(29)).toBe(0.29)
    expect(rupees(110)).toBe(1.1)
  })

  it("reports fabric in metres and pieces as counts", () => {
    expect(displayQuantity(metre, 2500)).toBe(2.5)
    expect(displayQuantity(metre, 500)).toBe(0.5)
    expect(displayQuantity(units.each("piece"), 3)).toBe(3)
    expect(displayQuantity(units.each("set"), 1)).toBe(1)
  })

  it("makes price x quantity equal the line total, for metres and pieces", () => {
    // Rs 200 a metre, 2.5 m: Rs 500.
    const cloth = lineItem({
      slug: "mulmul",
      name: "Mulmul",
      unit: metre,
      qty: 2500,
      unitPricePaise: 20000,
    })
    expect(cloth).toMatchObject({ item_id: "mulmul", price: 200, quantity: 2.5 })
    expect(cloth.price * cloth.quantity).toBe(500)
    // Rs 1,299 each, 3 of them.
    const piece = lineItem({
      slug: "kurti",
      name: "Kurti",
      unit: units.each(),
      qty: 3,
      unitPricePaise: 129900,
      colorName: "Sage",
      size: "M",
    })
    expect(piece).toMatchObject({ price: 1299, quantity: 3, item_variant: "Sage / M" })
    expect(
      lineItem({ slug: "a", name: "A", unit: units.each(), qty: 1, unitPricePaise: 100 })
        .item_variant
    ).toBeUndefined()
  })

  it("prices per display unit when the price is quoted per another base amount", () => {
    // Rs 20 per 100 mm of trim, shown in metres: Rs 200 a metre.
    const trim = { ...metre, pricePerBaseUnits: 100 }
    expect(
      lineItem({ slug: "t", name: "T", unit: trim, qty: 1000, unitPricePaise: 2000 }).price
    ).toBe(200)
  })

  it("builds list, select and view events with positions and the list name", () => {
    const products = [
      { slug: "a", name: "A", pricePaise: 10000 },
      { slug: "b", name: "B", pricePaise: 25050 },
    ]
    const list = events.viewItemList("/shop", products)
    expect(list.name).toBe("view_item_list")
    expect(list.params.items).toEqual([
      { item_id: "a", item_name: "A", price: 100, quantity: 1, item_list_name: "/shop", index: 0 },
      {
        item_id: "b",
        item_name: "B",
        price: 250.5,
        quantity: 1,
        item_list_name: "/shop",
        index: 1,
      },
    ])
    expect(events.selectItem("/shop", products[1]!, 1).params).toMatchObject({
      item_list_name: "/shop",
      items: [{ item_id: "b", index: 1 }],
    })
    expect(events.viewItem(products[0]!, "Dupattas").params).toMatchObject({
      currency: "INR",
      value: 100,
      items: [{ item_category: "Dupattas" }],
    })
    expect(productItem(products[0]!)).not.toHaveProperty("item_category")
  })

  it("sums bag and checkout values without float drift", () => {
    const items = [
      lineItem({ slug: "a", name: "A", unit: units.each(), qty: 1, unitPricePaise: 1010 }),
      lineItem({ slug: "b", name: "B", unit: metre, qty: 1500, unitPricePaise: 3333 }),
    ]
    // 10.10 + 1.5 x 33.33 = 10.10 + 49.995 = 60.095 -> the paise-rounded sum
    expect(events.viewCart(items).params.value).toBe(60.1)
    expect(events.beginCheckout(items, "WELCOME10").params).toMatchObject({
      coupon: "WELCOME10",
      currency: "INR",
    })
    expect(events.beginCheckout(items).params).not.toHaveProperty("coupon")
    expect(events.addShippingInfo(items, "Standard").params).toMatchObject({
      shipping_tier: "Standard",
    })
    expect(events.addPaymentInfo(items, "Razorpay").params).toMatchObject({
      payment_type: "Razorpay",
    })
  })

  it("builds a purchase with the transaction id, what was paid, tax and shipping", () => {
    const items = [
      lineItem({ slug: "a", name: "A", unit: units.each(), qty: 2, unitPricePaise: 50000 }),
    ]
    const e = events.purchase({
      orderNumber: "AF-26-000123",
      valuePaise: 108000,
      taxPaise: 0,
      shippingPaise: 8000,
      coupon: "WELCOME10",
      items,
    })
    expect(e.name).toBe("purchase")
    expect(e.params).toMatchObject({
      transaction_id: "AF-26-000123",
      currency: "INR",
      value: 1080,
      tax: 0,
      shipping: 80,
      coupon: "WELCOME10",
    })
  })

  it("limits search words to 100 characters", () => {
    expect(events.search("x".repeat(500)).params.search_term).toHaveLength(100)
    expect(events.viewSearchResults("cotton", 7).params).toEqual({
      search_term: "cotton",
      result_count: 7,
    })
  })
})

describe("purchase dedupe", () => {
  const memory = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  it("lets an order through once, however many times it is asked", () => {
    const store = memory()
    expect(claimPurchase(store, "AF-26-000001")).toBe(true)
    expect(claimPurchase(store, "AF-26-000001")).toBe(false)
    expect(claimPurchase(store, "AF-26-000001")).toBe(false)
    expect(claimPurchase(store, "AF-26-000002")).toBe(true)
  })

  it("rejects an order number that is not one", () => {
    const store = memory()
    for (const bad of ["", "x", "<script>", "a b c d", "A".repeat(80)])
      expect(claimPurchase(store, bad), bad).toBe(false)
  })

  it("survives blocked or damaged storage", () => {
    expect(claimPurchase(null, "AF-26-000001")).toBe(true)
    const broken = {
      getItem: () => "{{not json",
      setItem: () => {
        throw new Error("full")
      },
    }
    expect(claimPurchase(broken, "AF-26-000001")).toBe(true)
    const wrong = memory()
    wrong.setItem(PURCHASE_KEY, JSON.stringify({ not: "a list" }))
    expect(claimPurchase(wrong, "AF-26-000001")).toBe(true)
  })

  it("remembers only the latest fifty orders", () => {
    const store = memory()
    for (let i = 0; i < 60; i++) claimPurchase(store, `AF-26-${String(i).padStart(6, "0")}`)
    expect((JSON.parse(store.getItem(PURCHASE_KEY)!) as string[]).length).toBe(50)
  })
})

describe("tracking switch", () => {
  afterEach(() => {
    resetTracking()
    vi.unstubAllGlobals()
  })
  const event = events.search("cotton")

  it("sends nothing before consent, drops events when off, and holds early ones until it is on", () => {
    const gtag = vi.fn()
    vi.stubGlobal("window", { gtag })
    setTracking("off")
    track(event)
    expect(gtag).not.toHaveBeenCalled()

    resetTracking()
    track(event) // the page has not read the saved choice yet
    expect(gtag).not.toHaveBeenCalled()
    setTracking("on")
    expect(gtag).toHaveBeenCalledWith("event", "search", { search_term: "cotton" })
    track(event)
    expect(gtag).toHaveBeenCalledTimes(2)
  })

  it("throws away events held while waiting if the answer is no", () => {
    const gtag = vi.fn()
    vi.stubGlobal("window", { gtag })
    track(event)
    setTracking("off")
    setTracking("on")
    expect(gtag).not.toHaveBeenCalled()
  })

  it("never breaks the page, even if Google's code throws", () => {
    vi.stubGlobal("window", {
      gtag: () => {
        throw new Error("blocked")
      },
    })
    setTracking("on")
    expect(() => track(event)).not.toThrow()
  })
})
