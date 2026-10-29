import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { units } from "@/lib/measure"
import { InventoryMovement } from "@/models/inventory-movement"
import { InventoryReservation } from "@/models/inventory-reservation"
import { ProductVariant } from "@/models/product-variant"
import {
  adjustStock,
  commitReservation,
  expireDueReservations,
  InsufficientStockError,
  releaseReservation,
  reserveStock,
} from "@/services/inventory-service"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

let replSet: MongoMemoryReplSet
const oid = () => new mongoose.Types.ObjectId()

beforeAll(async () => {
  replSet = await startDatabase("inventory_test")
  await Promise.all([InventoryMovement, InventoryReservation, ProductVariant].map((m) => m.init()))
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(resetDatabase)

let n = 0
async function variant(onHandMm: number) {
  n += 1
  return ProductVariant.create({
    productId: oid(),
    sku: `INV-${n}`,
    sellingUnit: units.perMetre(),
    pricePaise: 20000,
    stock: { onHand: onHandMm, reserved: 0 },
  })
}
const stock = async (id: unknown) => (await ProductVariant.findById(id).lean())!.stock

describe("reserving stock", () => {
  it("50 parallel orders for 1 m against 10 m: exactly 10 win and reserved never exceeds on hand", async () => {
    const v = await variant(10_000)
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => reserveStock(oid(), [{ variantId: v._id, qty: 1000 }]))
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10)
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(failed).toHaveLength(40)
    expect(failed.every((r) => r.reason instanceof InsufficientStockError)).toBe(true)
    expect(await stock(v._id)).toEqual({ onHand: 10_000, reserved: 10_000 })
    expect(await InventoryMovement.countDocuments({ type: "reserve" })).toBe(10)
  }, 120_000)

  it("is all or nothing across several items", async () => {
    const a = await variant(5_000)
    const b = await variant(500)
    const order = oid()
    await expect(
      reserveStock(order, [
        { variantId: a._id, qty: 2_000 },
        { variantId: b._id, qty: 1_000 },
      ])
    ).rejects.toBeInstanceOf(InsufficientStockError)
    expect(await stock(a._id)).toEqual({ onHand: 5_000, reserved: 0 })
    expect(await InventoryReservation.countDocuments()).toBe(0)
    expect(await InventoryMovement.countDocuments()).toBe(0)
  })

  it("returns the same reservation when an order asks twice, and holds stock once", async () => {
    const v = await variant(5_000)
    const order = oid()
    const first = await reserveStock(order, [{ variantId: v._id, qty: 2_000 }])
    const again = await reserveStock(order, [{ variantId: v._id, qty: 2_000 }])
    expect(String(again._id)).toBe(String(first._id))
    expect((await stock(v._id)).reserved).toBe(2_000)
  })

  it("rejects empty, duplicate and non-integer lines", async () => {
    const v = await variant(5_000)
    await expect(reserveStock(oid(), [])).rejects.toThrow()
    await expect(reserveStock(oid(), [{ variantId: v._id, qty: 0 }])).rejects.toThrow()
    await expect(reserveStock(oid(), [{ variantId: v._id, qty: 1.5 }])).rejects.toThrow()
    await expect(
      reserveStock(oid(), [
        { variantId: v._id, qty: 500 },
        { variantId: v._id, qty: 500 },
      ])
    ).rejects.toThrow()
    expect((await stock(v._id)).reserved).toBe(0)
  })
})

describe("settling a reservation", () => {
  it("commit takes the stock off the shelf and releases the hold", async () => {
    const v = await variant(5_000)
    const order = oid()
    await reserveStock(order, [{ variantId: v._id, qty: 2_000 }])
    expect(await commitReservation(order)).toBe(true)
    expect(await stock(v._id)).toEqual({ onHand: 3_000, reserved: 0 })
    expect(await commitReservation(order)).toBe(false)
    expect(await releaseReservation(order)).toBe(false)
    expect(await stock(v._id)).toEqual({ onHand: 3_000, reserved: 0 })
  })

  it("release makes the stock available again, once, even when called in parallel", async () => {
    const v = await variant(5_000)
    const order = oid()
    await reserveStock(order, [{ variantId: v._id, qty: 2_000 }])
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => releaseReservation(order))
    )
    const done = outcomes.filter((o) => o.status === "fulfilled" && o.value === true)
    expect(done).toHaveLength(1)
    expect(await stock(v._id)).toEqual({ onHand: 5_000, reserved: 0 })
  })

  it("expiry releases only holds that have run out", async () => {
    const v = await variant(10_000)
    const now = new Date("2026-10-14T10:00:00Z")
    const old = oid()
    const fresh = oid()
    await reserveStock(old, [{ variantId: v._id, qty: 1_000 }], { now, minutes: 20 })
    await reserveStock(fresh, [{ variantId: v._id, qty: 1_000 }], {
      now: new Date(now.getTime() + 15 * 60_000),
      minutes: 20,
    })
    const later = new Date(now.getTime() + 25 * 60_000)
    expect(await expireDueReservations(later)).toBe(1)
    expect(await expireDueReservations(later)).toBe(0)
    expect((await stock(v._id)).reserved).toBe(1_000)
    expect((await InventoryReservation.findOne({ orderId: old }).lean())?.status).toBe("expired")
    expect((await InventoryReservation.findOne({ orderId: fresh }).lean())?.status).toBe("active")
  })

  it("always satisfies 0 <= reserved <= onHand after a mixed burst", async () => {
    const v = await variant(10_000)
    const orders = Array.from({ length: 30 }, () => oid())
    await Promise.allSettled(orders.map((o) => reserveStock(o, [{ variantId: v._id, qty: 700 }])))
    await Promise.allSettled(
      orders.map((o, i) =>
        i % 3 === 0 ? commitReservation(o) : i % 3 === 1 ? releaseReservation(o) : null
      )
    )
    const s = await stock(v._id)
    expect(s.reserved).toBeGreaterThanOrEqual(0)
    expect(s.reserved).toBeLessThanOrEqual(s.onHand)
    const sum = await InventoryMovement.aggregate([
      {
        $group: {
          _id: null,
          onHand: { $sum: "$deltaOnHand" },
          reserved: { $sum: "$deltaReserved" },
        },
      },
    ])
    expect(10_000 + sum[0].onHand).toBe(s.onHand)
    expect(sum[0].reserved).toBe(s.reserved)
  }, 120_000)
})

describe("adjusting stock", () => {
  it("adds and removes stock and records who and why", async () => {
    const v = await variant(1_000)
    const actorId = oid()
    await adjustStock({
      variantId: v._id,
      delta: 4_000,
      type: "restock",
      reason: "New roll",
      idempotencyKey: "r1",
      actorId,
    })
    await adjustStock({
      variantId: v._id,
      delta: -500,
      type: "wastage",
      reason: "Damaged edge",
      idempotencyKey: "w1",
    })
    expect((await stock(v._id)).onHand).toBe(4_500)
    const rows = await InventoryMovement.find({ variantId: v._id }).sort({ createdAt: 1 }).lean()
    expect(rows.map((r) => [r.type, r.deltaOnHand, r.onHandAfter])).toEqual([
      ["restock", 4_000, 5_000],
      ["wastage", -500, 4_500],
    ])
    expect(String(rows[0]!.actorId)).toBe(String(actorId))
  })

  it("will not drop stock below what is held for orders", async () => {
    const v = await variant(5_000)
    await reserveStock(oid(), [{ variantId: v._id, qty: 3_000 }])
    await expect(
      adjustStock({
        variantId: v._id,
        delta: -3_000,
        type: "adjust",
        reason: "Recount",
        idempotencyKey: "a1",
      })
    ).rejects.toThrow()
    await adjustStock({
      variantId: v._id,
      delta: -2_000,
      type: "adjust",
      reason: "Recount",
      idempotencyKey: "a2",
    })
    expect(await stock(v._id)).toEqual({ onHand: 3_000, reserved: 3_000 })
  })

  it("applies a retried request once", async () => {
    const v = await variant(1_000)
    const input = {
      variantId: v._id,
      delta: 500,
      type: "restock" as const,
      reason: "Roll",
      idempotencyKey: "same",
    }
    await adjustStock(input)
    await adjustStock(input)
    expect((await stock(v._id)).onHand).toBe(1_500)
    expect(await InventoryMovement.countDocuments()).toBe(1)
  })
})
