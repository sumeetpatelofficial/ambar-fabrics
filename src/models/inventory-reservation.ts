import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export const RESERVATION_STATUSES = ["active", "committed", "released", "expired"] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

/** Stock held for one order while its payment is pending. One per order. */
export interface InventoryReservationDoc {
  _id: Id
  orderId: Id
  lines: { variantId: Id; qty: number }[]
  status: ReservationStatus
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<InventoryReservationDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, unique: true },
    lines: {
      type: [
        new Schema(
          {
            variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
            qty: intField({ required: true, min: 1 }),
          },
          { _id: false }
        ),
      ],
      validate: { validator: (v: unknown[]) => v.length > 0, message: "a reservation needs lines" },
    },
    status: { type: String, enum: RESERVATION_STATUSES, default: "active" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

schema.index({ status: 1, expiresAt: 1 })

export const InventoryReservation = modelFor<InventoryReservationDoc>(
  "InventoryReservation",
  schema
)
