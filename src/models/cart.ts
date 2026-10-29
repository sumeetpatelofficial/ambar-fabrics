import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

export const CART_MAX_LINES = 50

/** A signed-in person's bag. Holds variant ids and quantities only: prices and stock are always re-read from the catalogue. */
export interface CartDoc {
  _id: Id
  userId: Id
  lines: { variantId: Id; qty: number; addedAt: Date }[]
  /** Ids of guest bags already folded in (the last few), so a repeated merge request adds nothing twice. */
  mergedIds: string[]
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<CartDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    lines: {
      type: [
        new Schema(
          {
            variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
            qty: intField({ required: true, min: 1 }),
            addedAt: { type: Date, default: () => new Date() },
          },
          { _id: false }
        ),
      ],
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= CART_MAX_LINES,
        message: `a bag holds at most ${CART_MAX_LINES} items`,
      },
    },
    mergedIds: { type: [{ type: String, maxlength: 80 }], default: [] },
  },
  { timestamps: true }
)

// Abandoned bags are deleted after 90 days without a change.
schema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

export const Cart = modelFor<CartDoc>("Cart", schema)
