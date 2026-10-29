import { Schema } from "mongoose"
import { INDIAN_STATES, type IndianState } from "@/config/addresses"
import { modelFor, type Id } from "./_shared"

export interface AddressDoc {
  _id: Id
  userId: Id
  label?: string
  fullName: string
  /** Ten-digit Indian mobile number. */
  phone: string
  line1: string
  line2?: string
  landmark?: string
  city: string
  state: IndianState
  pincode: string
  country: "IN"
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<AddressDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    label: { type: String, trim: true, maxlength: 30 },
    fullName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    phone: {
      type: String,
      required: true,
      match: [/^[6-9]\d{9}$/, "enter a 10-digit mobile number"] as [RegExp, string],
    },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    landmark: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, required: true, enum: INDIAN_STATES },
    pincode: {
      type: String,
      required: true,
      match: [/^[1-9]\d{5}$/, "enter a 6-digit PIN code"] as [RegExp, string],
    },
    country: { type: String, enum: ["IN"], default: "IN" },
  },
  { timestamps: true }
)

// Every read of an address is scoped by owner, so this is the access path.
schema.index({ userId: 1, createdAt: 1 })

export const Address = modelFor<AddressDoc>("Address", schema)
