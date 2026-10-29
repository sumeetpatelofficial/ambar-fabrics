import "server-only"
import mongoose from "mongoose"
import type { ReviewInput } from "@/features/reviews/schemas"
import { connectDb } from "@/lib/db/mongoose"
import { shortenQuote } from "@/lib/review-quote"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { Order } from "@/models/order"
import { Product } from "@/models/product"
import { Review, type ReviewDoc, type ReviewStatus } from "@/models/review"
import { User } from "@/models/user"
import { recordAudit } from "@/services/audit-service"

const trusted = mongoose.trusted
const oid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id))

// ------------------------------------------------------------------ eligibility

export type Eligibility =
  | {
      canReview: true
      existing?: { rating: number; title?: string; body: string; status: ReviewStatus }
    }
  | { canReview: false; reason: "signed_out" | "not_bought" | "not_delivered" }

/** The paid, delivered order that lets this person review this product, if there is one. */
async function qualifyingOrder(userId: string, productId: mongoose.Types.ObjectId) {
  const orders = await Order.find({
    userId: oid(userId),
    "items.productId": productId,
    paymentStatus: trusted({ $in: ["paid", "partially_refunded"] }),
    status: trusted({ $nin: ["cancelled", "expired", "needs_attention"] }),
  })
    .select({ fulfillmentStatus: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; fulfillmentStatus: string }[]>()
  return {
    bought: orders.length > 0,
    delivered: orders.find((o) => o.fulfillmentStatus === "delivered"),
  }
}

export async function getEligibility(userId: string | null, slug: string): Promise<Eligibility> {
  if (!userId) return { canReview: false, reason: "signed_out" }
  await connectDb()
  const product = await Product.findOne({ slug, status: "active" })
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }>()
  if (!product) throw new NotFoundError("We could not find that product.")
  const { bought, delivered } = await qualifyingOrder(userId, product._id)
  if (!bought) return { canReview: false, reason: "not_bought" }
  if (!delivered) return { canReview: false, reason: "not_delivered" }
  const existing = await Review.findOne({
    productId: product._id,
    userId: oid(userId),
  }).lean<ReviewDoc>()
  return {
    canReview: true,
    ...(existing
      ? {
          existing: {
            rating: existing.rating,
            title: existing.title,
            body: existing.body,
            status: existing.status,
          },
        }
      : {}),
  }
}

// ------------------------------------------------------------------ writing

/**
 * A buyer's review. Only for a product they bought and received; one per product, and editing it sends it
 * back for approval. It is shown to the public only once staff approve it.
 */
export async function submitReview(
  userId: string,
  slug: string,
  input: ReviewInput
): Promise<{ status: ReviewStatus }> {
  await connectDb()
  const product = await Product.findOne({ slug, status: "active" })
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }>()
  if (!product) throw new NotFoundError("We could not find that product.")
  const { bought, delivered } = await qualifyingOrder(userId, product._id)
  if (!bought) throw new ValidationError("Only people who bought this product can review it.")
  if (!delivered) throw new ValidationError("You can review it once your order has been delivered.")
  const doc = {
    rating: input.rating,
    title: input.title,
    body: input.body,
    orderId: delivered._id,
    status: "pending" as const,
  }
  const saved = await Review.findOneAndUpdate(
    { productId: product._id, userId: oid(userId) },
    {
      $set: { ...doc, moderationNote: undefined, moderatedBy: undefined },
      $setOnInsert: { productId: product._id, userId: oid(userId) },
    },
    { upsert: true, returnDocument: "after", runValidators: true }
  ).lean<ReviewDoc>()
  // A previously approved review that was just edited no longer counts until it is approved again.
  await recomputeRating(product._id)
  return { status: saved!.status }
}

/** The average and count shown on the product, from approved reviews only. */
export async function recomputeRating(
  productId: mongoose.Types.ObjectId
): Promise<{ avg: number; count: number }> {
  const [row] = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { productId, status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ])
  const count = row?.count ?? 0
  const avg = count ? Math.round(row!.avg * 10) / 10 : 0
  await Product.updateOne({ _id: productId }, { $set: { ratingAvg: avg, ratingCount: count } })
  return { avg, count }
}

// ------------------------------------------------------------------ reading

export type PublicReview = {
  id: string
  rating: number
  title?: string
  body: string
  author: string
  date: string
}
export type ReviewSummary = {
  avg: number
  count: number
  counts: [number, number, number, number, number]
}

const shortName = (name: string) => {
  const [first = "A customer", ...rest] = name.trim().split(/\s+/)
  const initial = rest.at(-1)?.[0]
  return initial ? `${first} ${initial.toUpperCase()}.` : first
}

export async function listApprovedReviews(
  slug: string,
  page = 1,
  pageSize = 10
): Promise<{
  summary: ReviewSummary
  reviews: PublicReview[]
  total: number
  pageSize: number
} | null> {
  await connectDb()
  const product = await Product.findOne({ slug, status: "active" })
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }>()
  if (!product) return null
  const [rows, spread] = await Promise.all([
    Review.find({ productId: product._id, status: "approved" })
      .sort({ createdAt: -1 })
      .skip((Math.max(1, page) - 1) * pageSize)
      .limit(pageSize)
      .lean<ReviewDoc[]>(),
    Review.aggregate<{ _id: number; n: number }>([
      { $match: { productId: product._id, status: "approved" } },
      { $group: { _id: "$rating", n: { $sum: 1 } } },
    ]),
  ])
  const counts: ReviewSummary["counts"] = [0, 0, 0, 0, 0]
  for (const s of spread) if (s._id >= 1 && s._id <= 5) counts[s._id - 1] = s.n
  const count = counts.reduce((a, b) => a + b, 0)
  const avg = count
    ? Math.round((counts.reduce((sum, n, i) => sum + n * (i + 1), 0) / count) * 10) / 10
    : 0
  const users = await User.find({ _id: trusted({ $in: rows.map((r) => r.userId) }) } as never)
    .select({ name: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
  const names = new Map(users.map((u) => [String(u._id), u.name]))
  return {
    summary: { avg, count, counts },
    total: count,
    pageSize,
    reviews: rows.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: shortName(names.get(String(r.userId)) ?? ""),
      date: r.createdAt.toISOString(),
    })),
  }
}

// ------------------------------------------------------------------ the home page

export type HomeReview = {
  quote: string
  /** First name and the first letter of the last name, never more ("Meera S."). */
  name: string
  rating: number
  /** The product that was bought, and its page. */
  bought: string
  href: string
}

/**
 * The best real reviews for the home page: approved, 4 or 5 stars, for products that are on sale, best
 * first and then newest, one per product so the row is varied. Public and read only; it exposes a short
 * name, the words, the rating and the product, nothing else (no email, no city, no order).
 */
export async function listHomeReviews(limit = 8): Promise<HomeReview[]> {
  await connectDb()
  const rows = await Review.find({ status: "approved", rating: trusted({ $gte: 4 }) } as never)
    .sort({ rating: -1, createdAt: -1 })
    .limit(limit * 6)
    .lean<ReviewDoc[]>()
  if (rows.length === 0) return []
  const products = await Product.find({
    _id: trusted({ $in: rows.map((r) => r.productId) }),
    status: "active",
  } as never)
    .select({ name: 1, slug: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string; slug: string }[]>()
  const byProduct = new Map(products.map((p) => [String(p._id), p]))
  const seen = new Set<string>()
  const chosen: { review: ReviewDoc; product: { name: string; slug: string } }[] = []
  for (const review of rows) {
    const key = String(review.productId)
    const product = byProduct.get(key)
    if (!product || seen.has(key)) continue
    seen.add(key)
    chosen.push({ review, product })
    if (chosen.length >= limit) break
  }
  const users = await User.find({
    _id: trusted({ $in: chosen.map((c) => c.review.userId) }),
  } as never)
    .select({ name: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
  const names = new Map(users.map((u) => [String(u._id), u.name]))
  return chosen.map(({ review, product }) => ({
    quote: shortenQuote(review.body),
    name: shortName(names.get(String(review.userId)) ?? ""),
    rating: review.rating,
    bought: product.name,
    href: `/products/${product.slug}#reviews`,
  }))
}

// ------------------------------------------------------------------ moderation

export type ModerationRow = {
  id: string
  productName: string
  productSlug: string
  rating: number
  title?: string
  body: string
  author: string
  status: ReviewStatus
  createdAt: string
}

export async function listForModeration(
  actor: Actor,
  status: ReviewStatus = "pending",
  limit = 50,
  page = 1
): Promise<ModerationRow[]> {
  return (await listForModerationPage(actor, status, page, limit)).rows
}

export async function listForModerationPage(
  actor: Actor,
  status: ReviewStatus = "pending",
  page = 1,
  pageSize = 15
): Promise<{ rows: ModerationRow[]; total: number; pageSize: number }> {
  assertPermission(actor, "reviews:moderate")
  await connectDb()
  const [rows, total] = await Promise.all([
    Review.find({ status })
      .sort({ createdAt: 1 })
      .skip((Math.max(1, page) - 1) * pageSize)
      .limit(pageSize)
      .lean<ReviewDoc[]>(),
    Review.countDocuments({ status }),
  ])
  const [products, users] = await Promise.all([
    Product.find({ _id: trusted({ $in: rows.map((r) => r.productId) }) } as never)
      .select({ name: 1, slug: 1 })
      .lean<{ _id: mongoose.Types.ObjectId; name: string; slug: string }[]>(),
    User.find({ _id: trusted({ $in: rows.map((r) => r.userId) }) } as never)
      .select({ name: 1 })
      .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>(),
  ])
  const p = new Map(products.map((x) => [String(x._id), x]))
  const u = new Map(users.map((x) => [String(x._id), x.name]))
  return {
    total,
    pageSize,
    rows: rows.map((r) => ({
      id: String(r._id),
      productName: p.get(String(r.productId))?.name ?? "(removed product)",
      productSlug: p.get(String(r.productId))?.slug ?? "",
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: u.get(String(r.userId)) ?? "A customer",
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

/** Approve or refuse a review. The product's average updates at once. Returns the product address for cache expiry. */
export async function moderateReview(
  actor: Actor,
  reviewId: string,
  decision: { approve: true } | { approve: false; note: string }
): Promise<{ slug: string }> {
  assertPermission(actor, "reviews:moderate")
  await connectDb()
  if (!mongoose.isValidObjectId(reviewId)) throw new NotFoundError()
  if (!decision.approve && !decision.note.trim())
    throw new ValidationError("Note why it is being refused, for the record.")
  const review = await Review.findOneAndUpdate(
    { _id: oid(reviewId) },
    {
      $set: {
        status: decision.approve ? "approved" : "rejected",
        moderatedBy: oid(actor.id),
        ...(decision.approve ? {} : { moderationNote: decision.note.trim().slice(0, 300) }),
      },
    },
    { returnDocument: "after" }
  ).lean<ReviewDoc>()
  if (!review) throw new NotFoundError()
  await recomputeRating(review.productId)
  await recordAudit({
    action: decision.approve ? "review.approved" : "review.rejected",
    actor,
    entityType: "review",
    entityId: reviewId,
  })
  const product = await Product.findById(review.productId)
    .select({ slug: 1 })
    .lean<{ slug: string }>()
  return { slug: product?.slug ?? "" }
}

export async function deleteReview(actor: Actor, reviewId: string): Promise<{ slug: string }> {
  assertPermission(actor, "reviews:moderate")
  await connectDb()
  if (!mongoose.isValidObjectId(reviewId)) throw new NotFoundError()
  const review = await Review.findByIdAndDelete(oid(reviewId)).lean<ReviewDoc>()
  if (!review) throw new NotFoundError()
  await recomputeRating(review.productId)
  await recordAudit({ action: "review.deleted", actor, entityType: "review", entityId: reviewId })
  const product = await Product.findById(review.productId)
    .select({ slug: 1 })
    .lean<{ slug: string }>()
  return { slug: product?.slug ?? "" }
}
