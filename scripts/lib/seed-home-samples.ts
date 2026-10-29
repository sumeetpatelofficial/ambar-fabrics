import mongoose from "mongoose"
import { Coupon } from "@/models/coupon"
import { Product } from "@/models/product"
import { Review } from "@/models/review"
import { User } from "@/models/user"
import { recomputeRating } from "@/services/review-service"

/**
 * Sample data for the two home page sections that come from real shop data: the festive offer (a coupon
 * ticked "Show on the home page") and the customer reviews. For development only: `pnpm db:seed --yes`
 * adds it and `pnpm db:seed --remove --yes` takes it out. Everything here can be told apart from real data
 * (the coupon code, the reviewers' @sample.invalid emails), so removal never touches anything real.
 */
export const SAMPLE_COUPON_CODE = "FESTIVE15"
export const SAMPLE_EMAIL_DOMAIN = "@sample.invalid"

const REVIEWERS: { name: string; product: string; rating: number; body: string }[] = [
  {
    name: "Meera Shah",
    product: "bandhani-dupatta",
    rating: 5,
    body: "The bandhani work is fine and the red is exactly as shown. It lifted a plain cotton suit straight away. I would order another colour.",
  },
  {
    name: "Anita Patel",
    product: "block-print-cotton",
    rating: 5,
    body: "Soft cotton and the block print is crisp. I bought three metres and it was cut cleanly, with no waste. It washed well too.",
  },
  {
    name: "Ritu Desai",
    product: "ajrakh-dupatta",
    rating: 4,
    body: "Beautiful indigo and madder, and the modal silk drapes lightly. A touch longer than I expected, which I liked.",
  },
  {
    name: "Pooja Mehta",
    product: "tissue-blouse",
    rating: 5,
    body: "The tissue blouse fits well and the gold catches the light without being loud. Arrived neatly packed.",
  },
  {
    name: "Kavita Joshi",
    product: "anarkali-kurti",
    rating: 4,
    body: "Lovely chinon and a graceful fall. The size chart was accurate. I wish it came with a matching dupatta.",
  },
  {
    name: "Nisha Trivedi",
    product: "mulmul-cotton",
    rating: 5,
    body: "Light, breathable mulmul for summer kurtas. Ordering by the half metre meant I only paid for what I needed.",
  },
  {
    name: "Farah Sheikh",
    product: "tissue-fabric",
    rating: 5,
    body: "Honest handloom cotton with a good weight. The colour matched the photograph and the edges were straight.",
  },
  {
    name: "Divya Rao",
    product: "ajrakh-print-modal-silk",
    rating: 4,
    body: "The ajrakh print on modal silk is rich and the fabric is silky to wear. Stitched into a kurta set and it looks expensive.",
  },
]

export async function removeSampleHomeContent(): Promise<{
  coupons: number
  reviews: number
  users: number
}> {
  const users = await User.find({
    email: new RegExp(`${SAMPLE_EMAIL_DOMAIN.replace(".", "\\.")}$`),
  })
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }[]>()
  const ids = users.map((u) => u._id)
  const touched = await Review.distinct("productId", { userId: mongoose.trusted({ $in: ids }) })
  const reviews = await Review.deleteMany({ userId: mongoose.trusted({ $in: ids }) })
  const removedUsers = await User.deleteMany({ _id: mongoose.trusted({ $in: ids }) })
  const coupons = await Coupon.deleteMany({ code: SAMPLE_COUPON_CODE })
  for (const productId of touched) await recomputeRating(productId as mongoose.Types.ObjectId)
  return {
    coupons: coupons.deletedCount,
    reviews: reviews.deletedCount,
    users: removedUsers.deletedCount,
  }
}

export async function seedSampleHomeContent(
  now = new Date()
): Promise<{ coupons: number; reviews: number }> {
  await removeSampleHomeContent()

  // Only one coupon is the home page's offer: the sample one takes the place of any other.
  await Coupon.updateMany({ showOnHome: true }, { $set: { showOnHome: false } })
  await Coupon.create({
    code: SAMPLE_COUPON_CODE,
    description: "Sample festive offer for development",
    type: "percent",
    percent: 15,
    minOrderPaise: 150_000,
    endsAt: new Date(now.getTime() + 30 * 86_400_000),
    perUserLimit: 1,
    active: true,
    showOnHome: true,
  })

  let reviews = 0
  const touched = new Set<string>()
  for (const [i, r] of REVIEWERS.entries()) {
    const product = await Product.findOne({ slug: r.product, status: "active" })
      .select({ _id: 1 })
      .lean<{ _id: mongoose.Types.ObjectId }>()
    if (!product) continue // the sample catalogue is not loaded, or that product was removed
    const user = await User.create({
      email: `reviewer${i + 1}${SAMPLE_EMAIL_DOMAIN}`,
      name: r.name,
      emailVerified: now,
      role: "customer",
    })
    await Review.create({
      productId: product._id,
      userId: user._id,
      orderId: new mongoose.Types.ObjectId(), // a sample has no real order behind it
      rating: r.rating,
      body: r.body,
      status: "approved",
      createdAt: new Date(now.getTime() - (i + 1) * 3 * 86_400_000),
    })
    touched.add(String(product._id))
    reviews += 1
  }
  for (const id of touched) await recomputeRating(new mongoose.Types.ObjectId(id))
  return { coupons: 1, reviews }
}
