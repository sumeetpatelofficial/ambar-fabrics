import { Schema } from "mongoose"
import { sellingUnitSchema, type SellingUnit } from "@/lib/measure"
import { intField, modelFor, type Id } from "./_shared"

export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "processing",
  "completed",
  "cancelled",
  "expired",
  "needs_attention",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const PAYMENT_STATUSES = [
  "unpaid",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export const FULFILLMENT_STATUSES = [
  "unfulfilled",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "returned",
  "rto",
] as const
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

export interface OrderItem {
  variantId: Id
  productId: Id
  slug: string
  name: string
  sku: string
  colorName?: string
  size?: string
  imageUrl?: string
  unit: SellingUnit
  qty: number
  unitPricePaise: number
  linePaise: number
  discountPaise: number
  taxPaise: number
  taxRatePercent: number
  /** Cut-to-length fabric is never returnable; other items follow the product's own setting. */
  returnable: boolean
  /** Estimated weight of this line in grams, for the parcel. */
  weightGrams: number
  /** What this line cost the shop when it was sold (for profit). Absent when no purchase price was recorded. */
  costLinePaise?: number
}

export interface OrderAddress {
  fullName: string
  phone: string
  line1: string
  line2?: string
  landmark?: string
  city: string
  state: string
  pincode: string
}

export interface OrderDoc {
  _id: Id
  orderNumber: string
  userId: Id
  email: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  currency: "INR"
  items: OrderItem[]
  pricing: {
    subtotalPaise: number
    discountPaise: number
    shippingPaise: number
    taxPaise: number
    taxExclusive: boolean
    totalPaise: number
  }
  coupon?: { couponId: Id; code: string }
  shippingAddress: OrderAddress
  gateway: "razorpay" | "mock" | "store"
  /** Where the sale happened. Absent on older orders, which were all online. */
  channel?: "online" | "store"
  /** For a sale made in the shop: how the customer paid. */
  paymentMethod?: "cash" | "upi" | "card"
  /** For a sale made in the shop: the staff member who recorded it. */
  soldBy?: Id
  /** Why a discount was given on a sale made in the shop. */
  discountReason?: string
  gatewayOrderId?: string
  idempotencyKey: string
  reservationExpiresAt: Date
  refundedPaise: number
  statusHistory: {
    from?: string
    to: string
    event: string
    actor: string
    at: Date
    note?: string
  }[]
  placedAt?: Date
  deliveredAt?: Date
  /** Set while a shipment exists or is being created, so two staff cannot book two couriers. */
  shipmentClaim?: Date
  /** Given once, when the invoice is first produced; numbers run without gaps within a financial year. */
  invoice?: { number: string; issuedAt: Date; financialYear: string }
  cancelledAt?: Date
  cancelReason?: string
  createdAt: Date
  updatedAt: Date
}

const money = (extra: Record<string, unknown> = {}) => intField({ required: true, ...extra })

const itemSchema = new Schema<OrderItem>(
  {
    variantId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    colorName: String,
    size: String,
    imageUrl: String,
    unit: { type: Schema.Types.Mixed, required: true },
    qty: money({ min: 1 }),
    unitPricePaise: money(),
    linePaise: money(),
    discountPaise: money({ default: 0 }),
    taxPaise: money({ default: 0 }),
    taxRatePercent: { type: Number, default: 0 },
    returnable: { type: Boolean, required: true },
    weightGrams: intField({ required: true, min: 1, default: 300 }),
    costLinePaise: intField(),
  },
  { _id: false }
)

const schema = new Schema<OrderDoc>(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ORDER_STATUSES, default: "pending_payment" },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "unpaid" },
    fulfillmentStatus: { type: String, enum: FULFILLMENT_STATUSES, default: "unfulfilled" },
    currency: { type: String, enum: ["INR"], default: "INR" },
    items: { type: [itemSchema], required: true },
    pricing: {
      subtotalPaise: money(),
      discountPaise: money(),
      shippingPaise: money(),
      taxPaise: money(),
      taxExclusive: { type: Boolean, required: true },
      totalPaise: money(),
      _id: false,
    },
    coupon: {
      type: new Schema({ couponId: Schema.Types.ObjectId, code: String }, { _id: false }),
    },
    shippingAddress: { type: Schema.Types.Mixed, required: true },
    gateway: { type: String, enum: ["razorpay", "mock", "store"], required: true },
    channel: { type: String, enum: ["online", "store"] },
    paymentMethod: { type: String, enum: ["cash", "upi", "card"] },
    soldBy: { type: Schema.Types.ObjectId, ref: "User" },
    discountReason: { type: String, maxlength: 200 },
    gatewayOrderId: { type: String },
    idempotencyKey: { type: String, required: true, maxlength: 100 },
    reservationExpiresAt: { type: Date, required: true },
    refundedPaise: intField({ default: 0 }),
    statusHistory: { type: [new Schema({}, { strict: false, _id: false })], default: [] },
    placedAt: Date,
    deliveredAt: Date,
    shipmentClaim: Date,
    invoice: {
      type: new Schema({ number: String, issuedAt: Date, financialYear: String }, { _id: false }),
    },
    cancelledAt: Date,
    cancelReason: { type: String, maxlength: 300 },
  },
  { timestamps: true }
)

schema.pre("validate", function () {
  for (const item of this.items) {
    const parsed = sellingUnitSchema.safeParse(item.unit)
    if (!parsed.success) this.invalidate("items", "an order item has an invalid unit")
  }
})

schema.index({ userId: 1, createdAt: -1 })
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true })
schema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true })
schema.index({ status: 1, createdAt: -1 })
// Reports: counted orders by day, and orders started by day.
schema.index({ placedAt: -1 }, { partialFilterExpression: { placedAt: { $exists: true } } })
schema.index({ createdAt: -1 })
schema.index({ channel: 1, createdAt: -1 }, { partialFilterExpression: { channel: "store" } })
schema.index(
  { status: 1, reservationExpiresAt: 1 },
  { partialFilterExpression: { status: "pending_payment" } }
)

export const Order = modelFor<OrderDoc>("Order", schema)
