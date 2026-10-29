import { Schema } from "mongoose"
import { modelFor, type Id } from "./_shared"

/** Every webhook delivery, keyed by the provider's event id, so a repeated delivery is recognised. */
export interface WebhookEventDoc {
  _id: Id
  provider: "razorpay" | "shiprocket"
  eventId: string
  type: string
  status: "received" | "processed" | "ignored" | "failed"
  error?: string
  receivedAt: Date
}
const schema = new Schema<WebhookEventDoc>({
  provider: { type: String, enum: ["razorpay", "shiprocket"], required: true },
  eventId: { type: String, required: true, maxlength: 120 },
  type: { type: String, required: true, maxlength: 80 },
  status: {
    type: String,
    enum: ["received", "processed", "ignored", "failed"],
    default: "received",
  },
  error: { type: String, maxlength: 300 },
  receivedAt: { type: Date, default: () => new Date() },
})
schema.index({ provider: 1, eventId: 1 }, { unique: true })
// Kept for 90 days.
schema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })
export const WebhookEvent = modelFor<WebhookEventDoc>("WebhookEvent", schema)
