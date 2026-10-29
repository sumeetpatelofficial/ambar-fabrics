import { Schema } from "mongoose"
import { modelFor, type Id } from "./_shared"

/** A sign-in identity linked to a user (Google today). Password sign-in lives on the User itself. */
export interface AuthAccountDoc {
  _id: Id
  userId: Id
  provider: "google"
  /** The provider's stable id for the person (Google's `sub`), never the email address. */
  providerAccountId: string
  emailAtLink: string
  linkedAt: Date
}

const schema = new Schema<AuthAccountDoc>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  provider: { type: String, enum: ["google"], required: true },
  providerAccountId: { type: String, required: true, maxlength: 128 },
  emailAtLink: { type: String, required: true, lowercase: true, maxlength: 254 },
  linkedAt: { type: Date, default: () => new Date() },
})

schema.index({ provider: 1, providerAccountId: 1 }, { unique: true })

export const AuthAccount = modelFor<AuthAccountDoc>("AuthAccount", schema)
