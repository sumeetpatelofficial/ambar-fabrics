import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** A buyer's rating of a product. Shown to the public only once staff have approved it. */
export interface ReviewDoc {
  _id: Id
  productId: Id
  userId: Id
  /** The paid, delivered order that makes this a verified purchase. */
  orderId: Id
  rating: number
  title?: string
  body: string
  status: ReviewStatus
  /** Why staff refused it, kept for the audit trail. */
  moderationNote?: string
  moderatedBy?: Id
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<ReviewDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    rating: { ...intField({ required: true, min: 1 }), max: 5 },
    title: { type: String, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, minlength: 10, maxlength: 1500 },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending" },
    moderationNote: { type: String, maxlength: 300 },
    moderatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
)
// One review per person per product.
schema.index({ productId: 1, userId: 1 }, { unique: true })
schema.index({ productId: 1, status: 1, createdAt: -1 })
schema.index({ status: 1, createdAt: 1 })

export const Review = modelFor<ReviewDoc>("Review", schema)
