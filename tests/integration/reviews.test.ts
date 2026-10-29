import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { ROLES, roleHasPermission } from "@/config/permissions"
import { reviewInputSchema } from "@/features/reviews/schemas"
import { ForbiddenError } from "@/lib/errors"
import { Address } from "@/models/address"
import { Order } from "@/models/order"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { User } from "@/models/user"
import { addToCart } from "@/services/cart-service"
import { createCheckout, markPaymentCaptured } from "@/services/order-service"
import {
  deleteReview,
  getEligibility,
  listApprovedReviews,
  listForModeration,
  moderateReview,
  submitReview,
} from "@/services/review-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => new mongoose.Types.ObjectId()
let key = 0
const idem = () => `review-key-${String(++key).padStart(8, "0")}-abcdefgh`
const moderator = { id: String(oid()), role: "support" as const }

beforeAll(async () => {
  replSet = await startDatabase("reviews_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
})

const input = (o: Record<string, unknown> = {}) =>
  reviewInputSchema.parse({
    rating: "5",
    title: "Lovely",
    body: "Soft, drapes well and the colour is true.",
    ...o,
  })

/** A customer who bought handloom cotton; `deliver` marks the order delivered. */
async function buyer(deliver = true, name = "Meera Shah") {
  const user = await User.create({ email: `${oid()}@example.com`, name })
  const userId = String(user._id)
  const address = await Address.create({
    userId,
    fullName: name,
    phone: "9876543210",
    line1: "1 Road",
    city: "Surat",
    state: "Gujarat",
    pincode: "395003",
  })
  const product = (await Product.findOne({ slug: "handloom-cotton" }).lean())!
  const variant = (await ProductVariant.findOne({ productId: product._id })
    .sort({ sku: 1 })
    .lean<ProductVariantDoc>())!
  await addToCart(userId, String(variant._id), 1000)
  const session = await createCheckout({
    userId,
    email: user.email,
    addressId: String(address._id),
    idempotencyKey: idem(),
    now: NOW,
  })
  await markPaymentCaptured({
    gatewayOrderId: session.gatewayOrderId,
    paymentId: `pay_${idem()}`,
    amountPaise: session.amountPaise,
  })
  if (deliver)
    await Order.updateOne(
      { orderNumber: session.orderNumber },
      { $set: { fulfillmentStatus: "delivered", deliveredAt: NOW } }
    )
  return { userId, product, orderNumber: session.orderNumber }
}

describe("who may review", () => {
  it("only a buyer whose order was delivered", async () => {
    const stranger = String(oid())
    expect(await getEligibility(null, "handloom-cotton")).toEqual({
      canReview: false,
      reason: "signed_out",
    })
    expect(await getEligibility(stranger, "handloom-cotton")).toEqual({
      canReview: false,
      reason: "not_bought",
    })
    const waiting = await buyer(false)
    expect(await getEligibility(waiting.userId, "handloom-cotton")).toEqual({
      canReview: false,
      reason: "not_delivered",
    })
    const done = await buyer(true)
    expect(await getEligibility(done.userId, "handloom-cotton")).toEqual({ canReview: true })
    // Buying one thing does not allow reviewing another.
    expect(await getEligibility(done.userId, "chinon")).toEqual({
      canReview: false,
      reason: "not_bought",
    })
    await expect(submitReview(stranger, "handloom-cotton", input())).rejects.toThrow(/bought/i)
    await expect(submitReview(waiting.userId, "handloom-cotton", input())).rejects.toThrow(
      /delivered/i
    )
  })

  it("not after the order was cancelled or fully refunded", async () => {
    const b = await buyer(true)
    await Order.updateOne(
      { orderNumber: b.orderNumber },
      { $set: { status: "cancelled", paymentStatus: "refunded" } }
    )
    expect(await getEligibility(b.userId, "handloom-cotton")).toEqual({
      canReview: false,
      reason: "not_bought",
    })
  })
})

describe("input rules", () => {
  it("accepts 1 to 5, trims text and strips control characters", () => {
    expect(input({ body: "  Soft\u0000 cotton, very nice  " }).body).toBe("Soft cotton, very nice")
    for (const bad of ["0", "6", "2.5", "x", ""]) expect(() => input({ rating: bad })).toThrow()
    expect(() => input({ body: "short" })).toThrow()
    expect(() => input({ body: "x".repeat(1501) })).toThrow()
    expect(() =>
      input({ body: "Visit http://a.example and http://b.example now please" })
    ).toThrow()
    expect(input({ title: "   " }).title).toBeUndefined()
  })
})

describe("the review lifecycle", () => {
  it("is hidden until approved, then counts towards the product's rating", async () => {
    const a = await buyer()
    const b = await buyer(true, "Ravi Patel")
    await submitReview(a.userId, "handloom-cotton", input({ rating: "5" }))
    await submitReview(b.userId, "handloom-cotton", input({ rating: "4", title: undefined }))
    expect((await listApprovedReviews("handloom-cotton"))?.reviews).toHaveLength(0)
    expect((await Product.findById(a.product._id).lean())?.ratingCount).toBe(0)

    const pending = await listForModeration(moderator)
    expect(pending).toHaveLength(2)
    await moderateReview(moderator, pending[0]!.id, { approve: true })
    await moderateReview(moderator, pending[1]!.id, { approve: true })
    const shown = (await listApprovedReviews("handloom-cotton"))!
    expect(shown.summary).toMatchObject({ avg: 4.5, count: 2, counts: [0, 0, 0, 1, 1] })
    expect(shown.reviews.map((r) => r.author).sort()).toEqual(["Meera S.", "Ravi P."])
    expect(await Product.findById(a.product._id).lean()).toMatchObject({
      ratingAvg: 4.5,
      ratingCount: 2,
    })
  })

  it("allows one per person: sending again edits it and sends it back for approval", async () => {
    const a = await buyer()
    await submitReview(a.userId, "handloom-cotton", input({ rating: "5" }))
    const [first] = await listForModeration(moderator)
    await moderateReview(moderator, first!.id, { approve: true })
    expect((await Product.findById(a.product._id).lean())?.ratingCount).toBe(1)
    const edited = await submitReview(
      a.userId,
      "handloom-cotton",
      input({ rating: "2", body: "Changed my mind after washing it." })
    )
    expect(edited.status).toBe("pending")
    expect((await Product.findById(a.product._id).lean())?.ratingCount).toBe(0) // not counted until approved again
    expect(await mongoose.model("Review").countDocuments()).toBe(1)
    const eligibility = await getEligibility(a.userId, "handloom-cotton")
    expect(eligibility).toMatchObject({
      canReview: true,
      existing: { rating: 2, status: "pending" },
    })
  })

  it("a refused review needs a note, never shows, and does not count", async () => {
    const a = await buyer()
    await submitReview(a.userId, "handloom-cotton", input())
    const [r] = await listForModeration(moderator)
    await expect(moderateReview(moderator, r!.id, { approve: false, note: " " })).rejects.toThrow(
      /why|note/i
    )
    await moderateReview(moderator, r!.id, { approve: false, note: "Not about the product" })
    expect((await listApprovedReviews("handloom-cotton"))?.reviews).toHaveLength(0)
    expect(await listForModeration(moderator, "rejected")).toHaveLength(1)
  })

  it("deleting an approved review updates the rating", async () => {
    const a = await buyer()
    await submitReview(a.userId, "handloom-cotton", input())
    const [r] = await listForModeration(moderator)
    await moderateReview(moderator, r!.id, { approve: true })
    await deleteReview(moderator, r!.id)
    expect(await Product.findById(a.product._id).lean()).toMatchObject({
      ratingAvg: 0,
      ratingCount: 0,
    })
  })

  it("stores markup as text, so it can never run", async () => {
    const a = await buyer()
    await submitReview(
      a.userId,
      "handloom-cotton",
      input({ body: "<img src=x onerror=alert(1)> but a nice fabric" })
    )
    const [r] = await listForModeration(moderator)
    expect(r!.body).toBe("<img src=x onerror=alert(1)> but a nice fabric") // shown escaped by React
  })

  it("lists approved reviews newest first in pages", async () => {
    const people = await Promise.all(Array.from({ length: 3 }, () => buyer()))
    for (const p of people) await submitReview(p.userId, "handloom-cotton", input())
    for (const r of await listForModeration(moderator))
      await moderateReview(moderator, r.id, { approve: true })
    const page1 = (await listApprovedReviews("handloom-cotton", 1, 2))!
    const page2 = (await listApprovedReviews("handloom-cotton", 2, 2))!
    expect([page1.reviews.length, page2.reviews.length, page1.total]).toEqual([2, 1, 3])
    expect(await listApprovedReviews("no-such-product")).toBeNull()
  })
})

describe("moderation permission", () => {
  it("only roles with reviews:moderate", async () => {
    for (const role of ROLES) {
      const outcome = await listForModeration({ id: String(oid()), role }).then(
        () => "ok",
        (e: unknown) => (e instanceof ForbiddenError ? "forbidden" : "other")
      )
      expect(outcome === "forbidden", role).toBe(!roleHasPermission(role, "reviews:moderate"))
    }
  })
})
