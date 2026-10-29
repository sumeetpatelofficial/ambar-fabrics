import { Schema } from "mongoose"
import { modelFor, type Id } from "./_shared"

/**
 * One-time tokens for email verification and password reset. Only a SHA-256 hash is stored; the
 * plaintext exists only in the email link. Expired rows are removed by the database (TTL index).
 */
export interface AuthTokenDoc {
  _id: Id
  userId: Id
  purpose: "verify_email" | "reset_password"
  tokenHash: string
  expiresAt: Date
  usedAt?: Date | null
  requestIp?: string
  createdAt: Date
}

const schema = new Schema<AuthTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    requestIp: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
schema.index({ userId: 1, purpose: 1 })

export const AuthToken = modelFor<AuthTokenDoc>("AuthToken", schema)
