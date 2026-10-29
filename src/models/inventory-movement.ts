import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export const MOVEMENT_TYPES = [
  "reserve",
  "release",
  "commit",
  "adjust",
  "restock",
  "wastage",
  "correction",
] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

/** Append-only record of every change to a variant's stock. Nothing in the code updates or deletes these. */
export interface InventoryMovementDoc {
  _id: Id
  variantId: Id
  type: MovementType
  deltaOnHand: number
  deltaReserved: number
  onHandAfter: number
  reservedAfter: number
  orderId?: Id
  actorId?: Id
  reason?: string
  /** Unique, so a retried operation cannot apply its stock change twice. */
  idempotencyKey: string
  createdAt: Date
}

const schema = new Schema<InventoryMovementDoc>(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    // Signed whole numbers in the variant's base unit.
    deltaOnHand: { type: Number, required: true, validate: Number.isSafeInteger },
    deltaReserved: { type: Number, required: true, validate: Number.isSafeInteger },
    onHandAfter: intField({ required: true }),
    reservedAfter: intField({ required: true }),
    orderId: { type: Schema.Types.ObjectId },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, trim: true, maxlength: 300 },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

schema.index({ variantId: 1, createdAt: -1 })
schema.index({ orderId: 1 }, { sparse: true })

export const InventoryMovement = modelFor<InventoryMovementDoc>("InventoryMovement", schema)
