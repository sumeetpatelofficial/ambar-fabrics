import { Schema } from "mongoose"
import { modelFor, type Id } from "./_shared"

export const WISHLIST_MAX_ITEMS = 200

export interface WishlistDoc {
  _id: Id
  userId: Id
  items: { productId: Id; addedAt: Date }[]
  updatedAt: Date
}

const schema = new Schema<WishlistDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: {
      type: [
        new Schema(
          {
            productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
            addedAt: { type: Date, default: () => new Date() },
          },
          { _id: false }
        ),
      ],
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= WISHLIST_MAX_ITEMS,
        message: `a wishlist holds at most ${WISHLIST_MAX_ITEMS} items`,
      },
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
)

export const Wishlist = modelFor<WishlistDoc>("Wishlist", schema)
