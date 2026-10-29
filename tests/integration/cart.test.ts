import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { Cart } from "@/models/cart"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import {
  addToCart,
  clearCart,
  getCartLines,
  mergeGuestBag,
  priceLines,
  removeFromCart,
  setCartQuantity,
} from "@/services/cart-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const user = () => String(new mongoose.Types.ObjectId())

beforeAll(async () => {
  replSet = await startDatabase("cart_test")
  await seedSampleCatalog(NOW)
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await Cart.deleteMany({})
  await ProductVariant.updateMany({}, { $set: { "stock.reserved": 0 } })
})

async function variantOf(slug: string, index = 0): Promise<ProductVariantDoc> {
  const p = await Product.findOne({ slug }).lean()
  const vs = await ProductVariant.find({ productId: p!._id, status: "active" })
    .sort({ sortOrder: 1, sku: 1 })
    .lean<ProductVariantDoc[]>()
  return vs[index]!
}
const id = (v: ProductVariantDoc) => String(v._id)

describe("pricing a bag", () => {
  it("prices from the catalogue and rounds each line once (Rs 180/m x 2.5 m = Rs 450)", async () => {
    const v = await variantOf("handloom-cotton")
    const priced = await priceLines([{ variantId: id(v), qty: 2500 }], NOW)
    expect(priced.lines[0]).toMatchObject({
      status: "ok",
      unitPricePaise: 18000,
      linePaise: 45000,
      name: expect.any(String),
    })
    expect(priced.subtotalPaise).toBe(45000)
    expect(priced.canCheckout).toBe(true)
  })

  it("follows a price change on the next read", async () => {
    const v = await variantOf("handloom-cotton")
    const before = await priceLines([{ variantId: id(v), qty: 1000 }], NOW)
    await ProductVariant.updateOne({ _id: v._id }, { $set: { pricePaise: 20000 } })
    const after = await priceLines([{ variantId: id(v), qty: 1000 }], NOW)
    await ProductVariant.updateOne({ _id: v._id }, { $set: { pricePaise: v.pricePaise } })
    expect(before.subtotalPaise).toBe(18000)
    expect(after.subtotalPaise).toBe(20000)
  })

  it("uses the sale price only inside the sale window", async () => {
    const v = await variantOf("handloom-cotton")
    await ProductVariant.updateOne(
      { _id: v._id },
      {
        $set: {
          salePricePaise: 15000,
          saleStartsAt: new Date("2026-10-10"),
          saleEndsAt: new Date("2026-10-20"),
        },
      }
    )
    const inside = await priceLines([{ variantId: id(v), qty: 1000 }], NOW)
    const outside = await priceLines([{ variantId: id(v), qty: 1000 }], new Date("2026-11-01"))
    await ProductVariant.updateOne(
      { _id: v._id },
      { $unset: { salePricePaise: 1, saleStartsAt: 1, saleEndsAt: 1 } }
    )
    expect(inside.subtotalPaise).toBe(15000)
    expect(outside.subtotalPaise).toBe(18000)
  })

  it("flags quantities that break the item's rules and leaves them out of the total", async () => {
    const v = await variantOf("handloom-cotton")
    const matrix = [
      { qty: 100, code: /minimum/i }, // below the minimum
      { qty: 700, code: /steps/i }, // off the step
      { qty: 99_000_000, code: /most|available/i }, // above max or stock
    ]
    for (const m of matrix) {
      const priced = await priceLines([{ variantId: id(v), qty: m.qty }], NOW)
      expect(priced.lines[0]?.status).toBe("invalid")
      expect(priced.lines[0]?.message).toMatch(m.code)
      expect(priced.subtotalPaise).toBe(0)
      expect(priced.canCheckout).toBe(false)
    }
  })

  it("reports an out-of-stock item and a deleted item", async () => {
    const v = await variantOf("handloom-cotton")
    await ProductVariant.updateOne({ _id: v._id }, { $set: { "stock.onHand": 0 } })
    const gone = String(new mongoose.Types.ObjectId())
    const priced = await priceLines(
      [
        { variantId: id(v), qty: 1000 },
        { variantId: gone, qty: 1 },
      ],
      NOW
    )
    await ProductVariant.updateOne({ _id: v._id }, { $set: { "stock.onHand": v.stock.onHand } })
    expect(priced.lines.map((l) => l.status)).toEqual(["invalid", "unavailable"])
    expect(priced.lines[0]?.message).toMatch(/out of stock/i)
    expect(priced.subtotalPaise).toBe(0)
  })

  it("never trusts malformed ids", async () => {
    const priced = await priceLines([{ variantId: "not-an-id", qty: 1 }], NOW)
    expect(priced.lines[0]?.status).toBe("unavailable")
  })
})

describe("the stored bag", () => {
  it("adds, adds more of the same, sets, and removes", async () => {
    const u = user()
    const v = await variantOf("handloom-cotton")
    expect(await addToCart(u, id(v), 1000)).toEqual([{ variantId: id(v), qty: 1000 }])
    expect(await addToCart(u, id(v), 500)).toEqual([{ variantId: id(v), qty: 1500 }])
    expect(await setCartQuantity(u, id(v), 3000)).toEqual([{ variantId: id(v), qty: 3000 }])
    expect(await removeFromCart(u, id(v))).toEqual([])
    expect(await getCartLines(u)).toEqual([])
  })

  it("refuses invalid quantities and keeps the bag unchanged", async () => {
    const u = user()
    const v = await variantOf("handloom-cotton")
    await addToCart(u, id(v), 1000)
    await expect(addToCart(u, id(v), 200)).rejects.toThrow(/steps/i)
    await expect(setCartQuantity(u, id(v), 100)).rejects.toThrow(/minimum/i)
    await expect(addToCart(u, id(v), 99_000_000)).rejects.toThrow()
    expect(await getCartLines(u)).toEqual([{ variantId: id(v), qty: 1000 }])
  })

  it("refuses unknown, inactive and malformed items", async () => {
    const u = user()
    await expect(addToCart(u, String(new mongoose.Types.ObjectId()), 1)).rejects.toThrow(
      /no longer/i
    )
    await expect(addToCart(u, "nope", 1)).rejects.toThrow()
    const v = await variantOf("handloom-cotton")
    await ProductVariant.updateOne({ _id: v._id }, { $set: { status: "inactive" } })
    await expect(addToCart(u, id(v), 1000)).rejects.toThrow(/no longer/i)
    await ProductVariant.updateOne({ _id: v._id }, { $set: { status: "active" } })
  })

  it("keeps every change when many are made at once", async () => {
    const u = user()
    const v = await variantOf("handloom-cotton")
    await Promise.all(Array.from({ length: 6 }, () => addToCart(u, id(v), 500)))
    expect(await getCartLines(u)).toEqual([{ variantId: id(v), qty: 3000 }])
  })

  it("keeps separate bags separate", async () => {
    const a = user()
    const b = user()
    const v = await variantOf("handloom-cotton")
    await addToCart(a, id(v), 1000)
    expect(await getCartLines(b)).toEqual([])
    await clearCart(a)
    expect(await getCartLines(a)).toEqual([])
  })
})

describe("merging a guest bag", () => {
  it("adds quantities for the same item and keeps the rest", async () => {
    const u = user()
    const v1 = await variantOf("handloom-cotton", 0)
    const v2 = await variantOf("handloom-cotton", 1)
    await addToCart(u, id(v1), 1000)
    const { lines, notices } = await mergeGuestBag(u, [
      { variantId: id(v1), qty: 1500 },
      { variantId: id(v2), qty: 500 },
    ])
    expect(notices).toEqual([])
    expect(Object.fromEntries(lines.map((l) => [l.variantId, l.qty]))).toEqual({
      [id(v1)]: 2500,
      [id(v2)]: 500,
    })
  })

  it("brings an over-large combined quantity down to what is available, with a notice", async () => {
    const u = user()
    const v = await variantOf("handloom-cotton")
    await ProductVariant.updateOne({ _id: v._id }, { $set: { "stock.onHand": 3000 } })
    await addToCart(u, id(v), 2000)
    const { lines, notices } = await mergeGuestBag(u, [{ variantId: id(v), qty: 2000 }])
    await ProductVariant.updateOne({ _id: v._id }, { $set: { "stock.onHand": v.stock.onHand } })
    expect(lines).toEqual([{ variantId: id(v), qty: 3000 }])
    expect(notices.join(" ")).toMatch(/reduced to 3 m/)
  })

  it("drops items that no longer exist and ignores junk, with a notice", async () => {
    const u = user()
    const { lines, notices } = await mergeGuestBag(u, [
      { variantId: String(new mongoose.Types.ObjectId()), qty: 1 },
      { variantId: "bad", qty: 1 },
      { variantId: "0".repeat(24), qty: -5 },
    ])
    expect(lines).toEqual([])
    expect(notices).toHaveLength(1)
  })

  it("applies a merge sent under the same id only once, even when it is sent again or at the same time", async () => {
    const u = user()
    const v = await variantOf("handloom-cotton")
    const guest = [{ variantId: id(v), qty: 1000 }]
    await mergeGuestBag(u, guest, "merge-id-0001")
    await mergeGuestBag(u, guest, "merge-id-0001") // the page changed and the request was sent again
    await Promise.all([
      mergeGuestBag(u, guest, "merge-id-0001"),
      mergeGuestBag(u, guest, "merge-id-0001"),
    ])
    expect(await getCartLines(u)).toEqual([{ variantId: id(v), qty: 1000 }])
    await mergeGuestBag(u, guest, "merge-id-0002") // a different bag is a different merge
    expect(await getCartLines(u)).toEqual([{ variantId: id(v), qty: 2000 }])
  })

  it("is safe to run twice at the same time", async () => {
    const u = user()
    const v = await variantOf("handloom-cotton")
    const guest = [{ variantId: id(v), qty: 1000 }]
    await Promise.all([mergeGuestBag(u, guest), mergeGuestBag(u, guest)])
    const stored = await getCartLines(u)
    expect(stored).toHaveLength(1)
    expect(stored[0]!.qty % 1000).toBe(0)
  })
})
