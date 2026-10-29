import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export interface CouponDoc {
  _id: Id
  code: string
  description?: string
  type: "percent" | "flat"
  percent?: number
  amountPaise?: number
  maxDiscountPaise?: number
  minOrderPaise: number
  startsAt?: Date
  endsAt?: Date
  /** Total uses allowed across everyone; unset means unlimited. */
  usageLimit?: number
  perUserLimit: number
  /** Orders currently using the coupon (pending or paid). Released when an order expires or is cancelled. */
  usedCount: number
  active: boolean
  /** Shown as the festive offer on the home page. At most one coupon has this at a time. */
  showOnHome?: boolean
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<CouponDoc>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9_-]{3,30}$/, "code must be 3-30 letters, numbers, dashes or underscores"],
    },
    description: { type: String, maxlength: 200 },
    type: { type: String, enum: ["percent", "flat"], required: true },
    percent: { type: Number, min: 0.01, max: 100 },
    amountPaise: intField({ min: 1 }),
    maxDiscountPaise: intField({ min: 1 }),
    minOrderPaise: intField({ default: 0 }),
    startsAt: Date,
    endsAt: Date,
    usageLimit: intField({ min: 1 }),
    perUserLimit: intField({ default: 1, min: 1 }),
    usedCount: intField({ default: 0 }),
    active: { type: Boolean, default: true },
    showOnHome: { type: Boolean, default: false },
  },
  { timestamps: true }
)
schema.pre("validate", function () {
  if (this.type === "percent" && this.percent === undefined)
    this.invalidate("percent", "a percentage coupon needs a percentage")
  if (this.type === "flat" && this.amountPaise === undefined)
    this.invalidate("amountPaise", "a flat coupon needs an amount")
})

export const Coupon = modelFor<CouponDoc>("Coupon", schema)

/** One row per order that uses a coupon, so per-person limits can be counted and uses released. */
export interface CouponRedemptionDoc {
  _id: Id
  couponId: Id
  userId: Id
  orderId: Id
  createdAt: Date
}
const redemption = new Schema<CouponRedemptionDoc>(
  {
    couponId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)
redemption.index({ couponId: 1, userId: 1 })
export const CouponRedemption = modelFor<CouponRedemptionDoc>("CouponRedemption", redemption)
