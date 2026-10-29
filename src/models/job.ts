import { Schema } from "mongoose"
import { modelFor, type Id } from "./_shared"

/**
 * Outbox for work that must happen reliably but not inside the request: emails now, shipment sync and
 * reconciliation later. A cron route drains it; each job is claimed atomically. See docs/architecture.md D-7.
 */
export interface JobDoc {
  _id: Id
  type: "email"
  payload: Record<string, unknown>
  /** Prevents the same logical job being queued twice (for example one verification email per token). */
  dedupeKey: string
  status: "queued" | "running" | "done" | "failed" | "dead"
  runAt: Date
  attempts: number
  lockedUntil?: Date | null
  lastError?: string
  doneAt?: Date
  createdAt: Date
}

const schema = new Schema<JobDoc>(
  {
    type: { type: String, enum: ["email"], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    dedupeKey: { type: String, required: true, unique: true, maxlength: 200 },
    status: {
      type: String,
      enum: ["queued", "running", "done", "failed", "dead"],
      default: "queued",
    },
    runAt: { type: Date, default: () => new Date() },
    attempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String, maxlength: 500 },
    doneAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

schema.index({ status: 1, runAt: 1 })
// Finished jobs are kept for a month for support, then removed by the database.
schema.index({ doneAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })

export const Job = modelFor<JobDoc>("Job", schema)
