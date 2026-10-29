import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { Product } from "@/models/product"
import { Review } from "@/models/review"
import { User } from "@/models/user"
import { listHomeReviews } from "@/services/review-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-20T06:00:00Z")
const oid = () => new mongoose.Types.ObjectId()
let n = 0

beforeAll(async () => {
  replSet = await startDatabase("home_reviews_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
  n = 0
})

async function review(o: {
  slug: string
  rating?: number
  status?: "approved" | "pending" | "rejected"
  name?: string
  body?: string
  daysAgo?: number
}) {
  const product = (await Product.findOne({ slug: o.slug }).lean())!
  const user = await User.create({
    email: `person${++n}@example.com`,
    name: o.name ?? "Meera Shah",
    emailVerified: NOW,
    role: "customer",
  })
  return Review.create({
    productId: product._id,
    userId: user._id,
    orderId: oid(),
    rating: o.rating ?? 5,
    body: o.body ?? "A lovely piece of cloth that I would buy again.",
    status: o.status ?? "approved",
    createdAt: new Date(NOW.getTime() - (o.daysAgo ?? 1) * 86_400_000),
  })
}

describe("the reviews on the home page", () => {
  it("is empty until there are real approved reviews", async () => {
    expect(await listHomeReviews()).toEqual([])
    await review({ slug: "handloom-cotton", status: "pending" })
    await review({ slug: "mulmul-cotton", status: "rejected" })
    expect(await listHomeReviews()).toEqual([])
  })

  it("shows only approved reviews of 4 or 5 stars", async () => {
    await review({ slug: "handloom-cotton", rating: 5 })
    await review({ slug: "mulmul-cotton", rating: 4 })
    await review({ slug: "bandhani-dupatta", rating: 3 })
    await review({ slug: "ajrakh-dupatta", rating: 1 })
    expect((await listHomeReviews()).map((r) => r.bought).sort()).toEqual([
      "Handloom cotton",
      "Mulmul cotton",
    ])
  })

  it("gives a short name and the product, and nothing that identifies the person", async () => {
    await review({ slug: "handloom-cotton", name: "Meera Shah" })
    const [r] = await listHomeReviews()
    expect(r).toEqual({
      quote: "A lovely piece of cloth that I would buy again.",
      name: "Meera S.",
      rating: 5,
      bought: "Handloom cotton",
      href: "/products/handloom-cotton#reviews",
    })
    expect(JSON.stringify(r)).not.toMatch(/example\.com|Shah|@/)
  })

  it("puts the best first, then the newest, with one review per product", async () => {
    await review({ slug: "mulmul-cotton", rating: 4, daysAgo: 1 })
    await review({ slug: "handloom-cotton", rating: 5, daysAgo: 9 })
    await review({ slug: "handloom-cotton", rating: 5, daysAgo: 2, name: "Anita Patel" }) // a second one for the same product
    await review({ slug: "bandhani-dupatta", rating: 5, daysAgo: 5 })
    const list = await listHomeReviews()
    expect(list.map((r) => r.bought)).toEqual([
      "Handloom cotton",
      "Bandhani dupatta",
      "Mulmul cotton",
    ])
    expect(list[0]!.name).toBe("Anita P.") // the newer of the two five-star reviews of that product
  })

  it("skips products that are no longer on sale, honours the limit, and shortens long reviews", async () => {
    await review({ slug: "handloom-cotton", body: "word ".repeat(120).trim() })
    await review({ slug: "mulmul-cotton" })
    await review({ slug: "bandhani-dupatta" })
    await Product.updateOne({ slug: "bandhani-dupatta" }, { $set: { status: "archived" } })
    const all = await listHomeReviews()
    expect(all.map((r) => r.bought).sort()).toEqual(["Handloom cotton", "Mulmul cotton"])
    expect(all.find((r) => r.bought === "Handloom cotton")!.quote.length).toBeLessThanOrEqual(221)
    expect(all.find((r) => r.bought === "Handloom cotton")!.quote.endsWith("…")).toBe(true)
    expect(await listHomeReviews(1)).toHaveLength(1)
  })
})
