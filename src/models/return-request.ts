import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export const RETURN_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "received",
  "refunded",
] as const
export type ReturnStatus = (typeof RETURN_STATUSES)[number]

export interface ReturnRequestDoc {
  _id: Id
  orderId: Id
  userId: Id
  items: { variantId: Id; qty: number }[]
  reason: string
  status: ReturnStatus
  /** Why staff refused, shown to the customer. */
  decisionNote?: string
  decidedBy?: Id
  refundId?: Id
  refundAmountPaise?: number
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<ReturnRequestDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: {
      type: [
        new Schema(
          {
            variantId: { type: Schema.Types.ObjectId, required: true },
            qty: intField({ required: true, min: 1 }),
          },
          { _id: false }
        ),
      ],
      validate: { validator: (v: unknown[]) => v.length > 0, message: "a return needs items" },
    },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
    status: { type: String, enum: RETURN_STATUSES, default: "requested" },
    decisionNote: { type: String, maxlength: 300 },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    refundId: { type: Schema.Types.ObjectId },
    refundAmountPaise: intField(),
  },
  { timestamps: true }
)
schema.index({ orderId: 1 })
schema.index({ userId: 1, createdAt: -1 })
schema.index({ status: 1, createdAt: -1 })

export const ReturnRequest = modelFor<ReturnRequestDoc>("ReturnRequest", schema)
