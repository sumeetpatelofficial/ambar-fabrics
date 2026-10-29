import { Schema } from "mongoose"
import { modelFor } from "./_shared"

/** One counter per (rule, subject, time window). Expired buckets are removed by the database. */
export interface RateLimitBucketDoc {
  _id: string
  count: number
  expiresAt: Date
}

const schema = new Schema<RateLimitBucketDoc>({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
})

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const RateLimitBucket = modelFor<RateLimitBucketDoc>("RateLimitBucket", schema)
