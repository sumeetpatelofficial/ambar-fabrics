import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export const PAYMENT_ATTEMPT_STATUSES = ["created", "captured", "failed"] as const

/** One row per gateway order. Never holds card details, only ids and the gateway's reason codes. */
export interface PaymentDoc {
  _id: Id
  orderId: Id
  gateway: "razorpay" | "mock" | "store"
  /** For a payment taken in the shop. */
  method?: "cash" | "upi" | "card"
  gatewayOrderId: string
  gatewayPaymentId?: string
  amountPaise: number
  status: (typeof PAYMENT_ATTEMPT_STATUSES)[number]
  errorCode?: string
  errorDescription?: string
  capturedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<PaymentDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true },
    gateway: { type: String, enum: ["razorpay", "mock", "store"], required: true },
    method: { type: String, enum: ["cash", "upi", "card"] },
    gatewayOrderId: { type: String, required: true, unique: true },
    gatewayPaymentId: { type: String },
    amountPaise: intField({ required: true, min: 1 }),
    status: { type: String, enum: PAYMENT_ATTEMPT_STATUSES, default: "created" },
    errorCode: { type: String, maxlength: 100 },
    errorDescription: { type: String, maxlength: 300 },
    capturedAt: Date,
  },
  { timestamps: true }
)
schema.index({ orderId: 1 })
schema.index({ gatewayPaymentId: 1 }, { unique: true, sparse: true })

export const Payment = modelFor<PaymentDoc>("Payment", schema)
