import { Schema } from "mongoose"
import { ROLES, type Role } from "@/config/permissions"
import { intField, modelFor, type Id } from "./_shared"

export interface UserDoc {
  _id: Id
  email: string
  name: string
  /** E.164 style without spaces, for example +919876543210. Not unique. */
  phone?: string
  /** Absent for accounts that only use Google. Never selected by default and never serialised. */
  passwordHash?: string
  emailVerified?: Date | null
  role: Role
  status: "active" | "suspended" | "deleted"
  /** Bumped on password change, reset, suspension or "sign out everywhere"; sessions carrying an older value die. */
  sessionVersion: number
  failedLoginCount: number
  lockedUntil?: Date | null
  marketingConsent?: { email: boolean; at?: Date }
  lastLoginAt?: Date
  defaultAddressId?: Id | null
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "email is not valid"] as [RegExp, string],
    },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[1-9]\d{9,14}$/, "phone number is not valid"] as [RegExp, string],
    },
    passwordHash: { type: String, select: false },
    emailVerified: { type: Date, default: null },
    role: { type: String, enum: ROLES, default: "customer" },
    status: { type: String, enum: ["active", "suspended", "deleted"], default: "active" },
    sessionVersion: intField({ default: 0 }),
    failedLoginCount: intField({ default: 0 }),
    lockedUntil: { type: Date, default: null },
    marketingConsent: { email: { type: Boolean, default: false }, at: Date, _id: false },
    lastLoginAt: Date,
    defaultAddressId: { type: Schema.Types.ObjectId, ref: "Address", default: null },
  },
  {
    timestamps: true,
    toJSON: {
      // Defence in depth: a hash or counter must never leave the server even if a document is serialised by mistake.
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash
        delete ret.failedLoginCount
        delete ret.lockedUntil
        return ret
      },
    },
  }
)

userSchema.index({ role: 1, status: 1 })

export const User = modelFor<UserDoc>("User", userSchema)
