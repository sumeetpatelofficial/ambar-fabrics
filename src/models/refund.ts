import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export interface RefundDoc {
  _id: Id
  orderId: Id
  paymentId: Id
  gatewayRefundId?: string
  amountPaise: number
  status: "requested" | "processed" | "failed"
  reason: string
  requestedBy?: Id
  idempotencyKey: string
  failureReason?: string
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<RefundDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true },
    paymentId: { type: Schema.Types.ObjectId, required: true },
    gatewayRefundId: { type: String },
    amountPaise: intField({ required: true, min: 1 }),
    status: { type: String, enum: ["requested", "processed", "failed"], default: "requested" },
    reason: { type: String, required: true, maxlength: 300 },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 120 },
    failureReason: { type: String, maxlength: 300 },
  },
  { timestamps: true }
)
schema.index({ orderId: 1 })
schema.index({ gatewayRefundId: 1 }, { unique: true, sparse: true })

export const Refund = modelFor<RefundDoc>("Refund", schema)
