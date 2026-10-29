import { describe, expect, it } from "vitest"
import { availability, availableQty } from "@/lib/inventory"
import { units } from "@/lib/measure"

const metre = units.perMetre()
const suit = units.each("set")

describe("availableQty", () => {
  it("is on-hand minus reserved", () => {
    expect(availableQty({ onHand: 10_000, reserved: 2_500 })).toBe(7_500)
  })

  it("never goes negative if the invariant is ever violated", () => {
    expect(availableQty({ onHand: 100, reserved: 500 })).toBe(0)
  })
})

describe("availability", () => {
  it("reports in stock without revealing the exact quantity", () => {
    const a = availability(metre, { onHand: 50_000, reserved: 0 }, 5_000)
    expect(a).toEqual({ status: "in_stock", label: "In stock", maxOrderable: 50_000 })
  })

  it("reports low stock with the real remaining length at or below the threshold", () => {
    const a = availability(metre, { onHand: 5_000, reserved: 2_000 }, 5_000)
    expect(a.status).toBe("low_stock")
    expect(a.label).toBe("Only 3 m left")
    expect(a.maxOrderable).toBe(3_000)
  })

  it("is out of stock when less than the minimum order remains", () => {
    expect(availability(metre, { onHand: 400, reserved: 0 }, 5_000).status).toBe("out_of_stock")
    expect(availability(metre, { onHand: 1_000, reserved: 1_000 }, 5_000).label).toBe(
      "Out of stock"
    )
    expect(availability(suit, { onHand: 0, reserved: 0 }, 2).maxOrderable).toBe(0)
  })

  it("counts reserved stock as unavailable", () => {
    expect(availability(suit, { onHand: 3, reserved: 3 }, 2).status).toBe("out_of_stock")
    expect(availability(suit, { onHand: 3, reserved: 1 }, 2)).toMatchObject({
      status: "low_stock",
      label: "Only 2 sets left",
    })
  })
})
